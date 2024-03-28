import {CfnOutput, Duration, StackProps} from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import {Construct} from "constructs";
import { Runtime} from "aws-cdk-lib/aws-lambda";
import {Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {LambdaInvoke} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { StateMachine, TaskInput} from "aws-cdk-lib/aws-stepfunctions";
import {Code, Function} from "aws-cdk-lib/aws-lambda";
import * as fs from "fs";
import * as path from "path";


export interface RdsFailoverStackProps extends StackProps{
    primaryRegion: string;
    secondaryRegion: string;
    globalTable: string
}

export class RdsFailoverStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: RdsFailoverStackProps) {
        super(scope, id);

        const rdsFailoverLambda = new Function(this, 'RDSFailoverLambda', {
            code: Code.fromInline(fs.readFileSync(path.resolve(__dirname, './lambdas/rds-failover.py'), { encoding: 'utf-8' })),
            handler: 'index.lambda_handler',
            timeout: Duration.seconds(900),
            runtime: Runtime.PYTHON_3_9,
            reservedConcurrentExecutions: 1,
        });

        rdsFailoverLambda.addToRolePolicy(new PolicyStatement({
            resources: [
                `arn:aws:rds:${props.primaryRegion}:${process.env.CDK_DEFAULT_ACCOUNT}:cluster:*`,
                `arn:aws:rds:${props.secondaryRegion}:${process.env.CDK_DEFAULT_ACCOUNT}:cluster:*`,
                `arn:aws:rds::${process.env.CDK_DEFAULT_ACCOUNT}:global-cluster:${props.globalTable}`,
            ],
            actions: [
                "rds:FailoverGlobalCluster",
            ],
            effect: Effect.ALLOW
        }))

        rdsFailoverLambda.addToRolePolicy(new PolicyStatement({
            resources: [
                `arn:aws:rds::${process.env.CDK_DEFAULT_ACCOUNT}:global-cluster:${props.globalTable}`,
            ],
            actions: [
                "rds:DescribeGlobalClusters",
            ],
            effect: Effect.ALLOW
        }))

        const failoverDefinition = new LambdaInvoke(this, 'RDSFailoverInvoke', {
            lambdaFunction: rdsFailoverLambda,
            payload: TaskInput.fromObject({
                "primary_region": props.primaryRegion,
                "secondary_region": props.secondaryRegion,
                "global_table": props.globalTable,
                "action.$": "$.action"
            }),

            outputPath: "$.Payload"
        });

        const stateMachineRdsFailover = new StateMachine(this, 'DRRDSFailoverStepFunction', {
            definition: failoverDefinition,
            stateMachineName: 'DRRDSFailoverStepFunction',
            timeout: Duration.minutes(30),
        });

        new CfnOutput(this,"DRRDSFailoverStepFunctionArn", {
            value: stateMachineRdsFailover.stateMachineArn
        })

    }
}