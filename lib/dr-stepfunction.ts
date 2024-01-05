import * as fs from 'fs';
import * as path from 'path';
import {CfnOutput, Duration} from 'aws-cdk-lib';
import {Code, Function, Runtime} from 'aws-cdk-lib/aws-lambda';
import {
    Choice,
    Condition,
    Fail,
    IntegrationPattern,
    StateMachine,
    Succeed,
    TaskInput
} from 'aws-cdk-lib/aws-stepfunctions';
import {LambdaInvoke, StepFunctionsStartExecution} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import {Construct} from 'constructs';
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";

export interface DrStepfunctionsProps {
    readonly arcClusterEndpointsTable: string,
    readonly failoverTable: string,
    readonly failbackTable: string,
    readonly action: string;
    readonly arcClusterName: string;
    readonly controlPlaneArn: string;
    readonly childStepFunctionArn: string;
}

export class DrStepfunction extends Construct {
    constructor(scope: Construct, id: string , props: DrStepfunctionsProps) {
        super(scope, id);

        const routingUpdateHandler = new Function(this, 'DRRoutingControlUpdateFunction', {
            code: Code.fromInline(fs.readFileSync(path.resolve(__dirname, './lambdas/routing_control_update_handler.py'), { encoding: 'utf-8' })),
            handler: 'index.lambda_handler',
            timeout: Duration.seconds(900),
            runtime: Runtime.PYTHON_3_9,
            environment: {
                "DELAY": "7",
            },
            reservedConcurrentExecutions: 1
        });

        routingUpdateHandler.addToRolePolicy(new PolicyStatement({
            resources: [
                `arn:aws:dynamodb:*:${process.env.CDK_DEFAULT_ACCOUNT}:table/${props.arcClusterEndpointsTable}`,
                `arn:aws:dynamodb:*:${process.env.CDK_DEFAULT_ACCOUNT}:table/${props.failoverTable}`,
                `arn:aws:dynamodb:*:${process.env.CDK_DEFAULT_ACCOUNT}:table/${props.failbackTable}`
            ],
            actions: [
                'dynamodb:Query',
                'dynamodb:GetItem'
            ],
            effect: Effect.ALLOW
        }))

        routingUpdateHandler.addToRolePolicy(new PolicyStatement({
            resources: [
                "*"
            ],
            actions: [
                'route53-recovery-cluster:ListRoutingControls',
            ],
            effect: Effect.ALLOW
        }))

        routingUpdateHandler.addToRolePolicy(new PolicyStatement({
            resources: [
                `arn:aws:route53-recovery-control::${process.env.CDK_DEFAULT_ACCOUNT}:controlpanel/${props.controlPlaneArn.split("/")[1]}/routingcontrol/*`,
            ],
            actions: [
                'route53-recovery-cluster:UpdateRoutingControlState',
                'route53-recovery-cluster:GetRoutingControlState'
            ],
            effect: Effect.ALLOW
        }))

        const routingUpdateHandlerInvokePre = new LambdaInvoke(this, 'DRRoutingControlUpdateFunctionInvokePre', {
            lambdaFunction: routingUpdateHandler,
            payload: TaskInput.fromObject({
                "endpoint_table": props.arcClusterEndpointsTable ,
                "failover_table": props.failoverTable,
                "failback_table": props.failbackTable,
                "arc_cluster":  props.arcClusterName,
                "action": props.action,
                "desired_state": "Off"
            }),
            outputPath: "$.Payload"
        });

        const routingUpdateHandlerInvokePost = new LambdaInvoke(this, 'DRRoutingControlUpdateFunctionInvokePost', {
            lambdaFunction: routingUpdateHandler,
            payload: TaskInput.fromObject({
                "endpoint_table": props.arcClusterEndpointsTable ,
                "failover_table": props.failoverTable,
                "failback_table": props.failbackTable,
                "arc_cluster":  props.arcClusterName,
                "action": props.action,
                "desired_state": "On"
            }),
            outputPath: "$.Payload"
        });

        const fail = new Fail(this, 'Fail', {
            comment: "Fail"
        });

        const success = new Succeed(this, 'Success', {
            comment: 'Pass',
        });

        const childStepFunctionExecution = new StepFunctionsStartExecution(this, 'ChildStepFunction', {
            stateMachine: StateMachine.fromStateMachineArn(this,"child",props.childStepFunctionArn),
            integrationPattern: IntegrationPattern.RUN_JOB,
            input: TaskInput.fromObject({
                "action": props.action
            }),
            outputPath: "$.Output"
        });

        const definition = routingUpdateHandlerInvokePre
                            .next(new Choice(this, 'Check if Routing Control Turned Off successfully ?')
                                .when(Condition.booleanEquals('$.error', true), fail)
                                .otherwise(childStepFunctionExecution.next(new Choice(this, 'Check if DR Child StepFunction ran successfully ?')
                                    .when(Condition.booleanEquals('$.error', true), fail)
                                    .otherwise(routingUpdateHandlerInvokePost.next(new Choice(this, 'Check if Routing Control Turned On successfully?')
                                    .when(Condition.booleanEquals('$.error', true), fail)
                                        .otherwise(success))))))

        const stateMachine = new StateMachine(this, 'DRRoutingControlStepFunction', {
            definition,
            stateMachineName: 'DRRoutingControlStepFunction-'+props.action,
            timeout: Duration.minutes(60),
        });

        new CfnOutput(this,"DRRoutingControlStepFunctionArn", {
            value: stateMachine.stateMachineArn
        })

    }
}
