import * as cdk from "aws-cdk-lib";
import {StackProps} from "aws-cdk-lib";
import {ArcCluster, Route53ArcConfig} from "./types/route53ArcConfig";
import {Construct} from "constructs";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {Table, TableEncryption} from 'aws-cdk-lib/aws-dynamodb';
import {AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId} from "aws-cdk-lib/custom-resources";
import {
    generateEndpointDocument,
    generateFailbackRoutingControlsDocument,
    generateFailoverRoutingControlsDocument
} from "./util";
import {DrStepfunction} from "./dr-stepfunction";


export interface DdSetupStackProps extends StackProps{
    config: Route53ArcConfig;
}

export class DdSetupStack extends cdk.Stack {

    arcClusterEndpointsTable: Table;
    failoverTable: Table;
    failbackTable: Table;
    constructor(scope: Construct, id: string, props: DdSetupStackProps) {
        super(scope, id);

        if (process.env.CDK_DEFAULT_REGION == props.config.primary) {
            this.createArcClusterEndpointsTable(props.config.arcCluster, [props.config.primary, props.config.secondary])
            this.createFailoverRoutingControlsTable(props.config.arcCluster, [props.config.primary, props.config.secondary])
            this.createFailbackRoutingControlsTable(props.config.arcCluster, [props.config.primary, props.config.secondary])
        }

        const childStepFunctionArn = process.env.CDK_DEFAULT_REGION == props.config.primary ? props.config.primaryStepfunctionArn : props.config.secondaryStepfunctionArn

        new DrStepfunction(this, "DRFailoverStepFunction", {
            arcClusterEndpointsTable: 'route53_arc_clusterEndpoints',
            failoverTable: 'route53_arc_failover',
            failbackTable: 'route53_arc_failback',
            arcClusterName: props.config.arcCluster.clusterName,
            controlPlaneArn: props.config.arcCluster.controlPanel.controlPanelArn,
            action: "fail_over",
            childStepFunctionArn: childStepFunctionArn
        })

        new DrStepfunction(this, "DRFailbackStepFunction", {
            arcClusterEndpointsTable: 'route53_arc_clusterEndpoints',
            failoverTable: 'route53_arc_failover',
            failbackTable: 'route53_arc_failback',
            arcClusterName: props.config.arcCluster.clusterName,
            controlPlaneArn: props.config.arcCluster.controlPanel.controlPanelArn,
            action: "fail_back",
            childStepFunctionArn: childStepFunctionArn
        })

    }
    createArcClusterEndpointsTable(arcCluster: ArcCluster, replicationRegion: string[]){

        const globalTable = new dynamodb.Table(this, 'ArcClusterEndpoints', {
            partitionKey: { name: 'arcClusterName', type: dynamodb.AttributeType.STRING },
            replicationRegions: replicationRegion, //Add more regions to replicate
            tableName: "route53_arc_clusterEndpoints",
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true
        });

        this.arcClusterEndpointsTable = globalTable

        new AwsCustomResource(this, 'ArcClusterEndpointsCustomResource', {

            onCreate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateEndpointDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('ArcClusterEndpointsInsert'),
            },
            onUpdate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateEndpointDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('ArcClusterEndpointsUpdate'),

            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [globalTable.tableArn] }),
        });
    }

    createFailoverRoutingControlsTable(arcCluster: ArcCluster,replicationRegion: string[]) {
        const globalTable = new dynamodb.Table(this, 'FailoverRoutingControls', {
            partitionKey: {name: 'arcClusterName', type: dynamodb.AttributeType.STRING},
            replicationRegions: replicationRegion, //Add more regions to replicate
            tableName: "route53_arc_failover",
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true

        });

        this.failoverTable = globalTable
        new AwsCustomResource(this, 'FailoverRoutingControlsCustomResource', {
            onCreate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateFailoverRoutingControlsDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('FailoverRoutingControlsInsert'),
            },
            onUpdate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateFailoverRoutingControlsDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('FailoverRoutingControlsUpdate'),

            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({resources: [globalTable.tableArn]}),
        });
    }

    createFailbackRoutingControlsTable(arcCluster: ArcCluster,replicationRegion: string[]) {

        const globalTable = new dynamodb.Table(this, 'FailbackRoutingControls', {
            partitionKey: {name: 'arcClusterName', type: dynamodb.AttributeType.STRING},
            replicationRegions: replicationRegion, //Add more regions to replicate
            tableName: "route53_arc_failback",
            encryption: TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true,
        });

        this.failbackTable = globalTable

        new AwsCustomResource(this, 'FailbackRoutingControlsCustomResource', {
            onCreate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateFailbackRoutingControlsDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('FailbackRoutingControlsInsert'),
            },
            onUpdate: {
                service: 'DynamoDB',
                action: 'putItem',
                parameters: {
                    TableName: globalTable.tableName,
                    Item: generateFailoverRoutingControlsDocument(arcCluster)
                },
                physicalResourceId: PhysicalResourceId.of('FailbackRoutingControlsUpdate'),

            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({resources: [globalTable.tableArn]}),
        });
    }

}