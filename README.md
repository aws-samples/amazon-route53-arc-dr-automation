## What this project does

This repository provides an automation framework, that can be used in the event of a region failover. This repo builds on the application that is deployed as part of the blog post
series - Building highly resilient applications using Amazon Route 53 Application Recovery Controller, [Part 2: Multi-Region stack](https://aws.amazon.com/blogs/networking-and-content-delivery/building-highly-resilient-applications-using-amazon-route-53-application-recovery-controller-part-2-multi-region-stack). Please
refer to the blog post for additional details and dependencies

## Stacks Created

This project creates two independent stacks. 
- **RDS Failover Step Function:**
This state machine, which when supplied with relevant configuration about primary and secondary regions, will perform a planned Failover of Global RDS Database.
- **Dynamo DB Table:**
Configuration information about ARC, Cluster Endpoints and Routing Controls are stored in a couple of DynamoDB Tables.

## Configuration
This repository uses two configuration file ([rds_failover_config_sample](./config/rds_failover_config_sample.yml) and [route53_arc_config_sample](./config/route53_arc_config_sample.yml)) which is used to configure 
the [RDS Failover Stack](./lib/rds-failover-stack.ts) and [DynamoDB Setup Stack](./lib/dd-setup-stack.ts). The configuration files which are in yaml format looks like below

### RDS Failover Configuration File
```yaml
account: "AWS_ACCOUNT"
primary: "Primary Region"
secondary: "Secondary Region"
globalClusterIdentifier: "Global Database Cluster Identifier"
```

### Route 53 Configuration File
```yaml
account: "AWS_ACCOUNT"
region: "REGION"
appName: "NAME_TO_BE_USED"
primary: "<primary region>"
secondary: "<secondary_region>"
primaryStepfunctionArn: "<Primary DR Automation Stepfunction arn>"
secondaryStepfunctionArn: "<Secondary DR Automation Stepfunction arn>"
arcCluster:
  clusterName: "ARC Cluster Name"
  endpoints:
    - region: "ARC Cluster Endpoint Region1"
      arn: "ARC Cluster Endpoint ARN1"
    - region: "ARC Cluster Endpoint Region2"
      arn: "ARC Cluster Endpoint ARN2"
    - region: "ARC Cluster Endpoint Region3"
      arn: "ARC Cluster Endpoint ARN3"
    - region: "ARC Cluster Endpoint Region4"
      arn: "ARC Cluster Endpoint ARN4"
    - region: "ARC Cluster Endpoint Region5"
      arn: "ARC Cluster Endpoint ARN5"
  controlPanel:
    controlPanelArn: "ARC Cluster Control Panel ARN"
    failoverRoutingControls:
      primary:
        - Primary Routing Control Name
      secondary:
        - Secondary Routing Control Name
    failbackRoutingControls:
      primary:
        - Primary Routing Control Name During Failback
      secondary:
        - Secondary Routing Control Name During Failback
```

All the fields in the above-mentioned configuration file are mandatory and failure to configure them with valid values, can result in obscure failures when deploying the CDK stack

> **_NOTE:_**  Sample files in [Config Dir](./config) are provided as an example templates, please make sure values are appropriately modified before it is used
# How to deploy
After you have modified rds_failover_config_sample.yml and route53_arc_config_sample.yml in [Config Dir](./config) according to your needs, you can deploy the stacks using the following commands

```Shell
export AWS_DEFAULT_REGION=us-east-1 && cdk deploy -c rdsConfig=rds_failover_config RdsFailoverStackPrimary #Deploys RDS failover stack in primary region

export AWS_DEFAULT_REGION=us-west-2 && cdk deploy -c rdsConfig=rds_failover_config RdsFailoverStackSecondary #Deploys RDS failover stack in secondary region

export AWS_DEFAULT_REGION=us-east-1 && cdk deploy -c config=route53_arc_config DrStackPrimary #Deploys Failover and Failback step function in primary region

export AWS_DEFAULT_REGION=us-west-2 && cdk deploy -c config=route53_arc_config DrStackSecondary #Deploys Failover and Failback step function in secondary region
``` 


# How to destroy

You can destroy the entire stack in both regions using these commands

```Shell
export AWS_DEFAULT_REGION=us-east-1 && cdk destroy -c rdsConfig=rds_failover_config --all && #Destroys entire RDS stack in primary region
export AWS_DEFAULT_REGION=us-west-2 && cdk destroy -c rdsConfig=rds_failover_config --all && #Destroys entire RDS stack in secondary region
export AWS_DEFAULT_REGION=us-east-1 && cdk destroy -c config=route53_arc_config --all && #Destroys entire Route53 ARC stack in primary region
export AWS_DEFAULT_REGION=us-west-2 && cdk destroy -c config=route53_arc_config --all && #Destroys entire Route53 ARC stack in secondary region
```
