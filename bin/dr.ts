#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as fs from "fs";
import * as path from "path";
import * as Console from "console";
import {Route53ArcConfig, RdsConfig} from "../lib/types/route53ArcConfig";
import {DdSetupStack} from "../lib/dd-setup-stack";
import {RdsFailoverStack} from "../lib/rds-failover-stack";
import * as yaml from "js-yaml";

const app = new cdk.App();

function parseRoute53ArcConfig(){
    const env = app.node.tryGetContext('config');

    if (env == undefined) {
        return undefined
    }
    return yaml.load(fs.readFileSync(path.resolve("./config/" + env + ".yml"), "utf8")) as Route53ArcConfig;
}
function parseRdsConfig(){
    const env = app.node.tryGetContext('rdsConfig');
    if (env == undefined) {
        return undefined
    }
    return yaml.load(fs.readFileSync(path.resolve("./config/" + env + ".yml"), "utf8")) as RdsConfig;
}


async function main() {
    const config: any = parseRoute53ArcConfig()
    const rdsConfig: any = parseRdsConfig()

    if (rdsConfig == undefined && config == undefined) {
        throw  "Context variable missing on CDK command for rds. Pass in as -c rdsConfig=XXX or -c config=XXX"
    }

    if(rdsConfig != undefined) {
        new RdsFailoverStack(app, "RdsFailoverStackPrimary", {
            primaryRegion: rdsConfig.primary,
            secondaryRegion: rdsConfig.secondary,
            globalTable: rdsConfig.globalClusterIdentifier,
            env: {region: rdsConfig.primary, account: rdsConfig.account}
        })

        new RdsFailoverStack(app, "RdsFailoverStackSecondary", {
            primaryRegion: rdsConfig.primary,
            secondaryRegion: rdsConfig.secondary,
            globalTable: rdsConfig.globalClusterIdentifier,
            env: {region: rdsConfig.secondary, account: rdsConfig.account}
        })
    }

    if(config != undefined) {
        new DdSetupStack(app, "DrStackPrimary", {
            config: config,
            env: {region: config.primary, account: config.account}
        })

        new DdSetupStack(app, "DrStackSecondary", {
            config: config,
            env: {region: config.secondary, account: config.account}
        })
    }
}

main().then( r => Console.log("Error Starting "+r))
