import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {StackProps} from "aws-cdk-lib";
import {Route53ArcConfig} from "./types/route53ArcConfig";
import {DdSetupStack} from "./dd-setup-stack";

export interface DrSetupStackProps extends StackProps{
  config: Route53ArcConfig;
}

export class DrSetupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DrSetupStackProps) {
    super(scope, id);

    new DdSetupStack(this, `${props.config.appName}-DrSetupStack`, {
      config: props.config
    })

  }

}
