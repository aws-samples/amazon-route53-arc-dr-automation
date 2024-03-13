export interface Route53ArcConfig {
    account: string,
    region: string,
    primary: string,
    secondary: string,
    appName: string,
    arcCluster: ArcCluster
    primaryStepfunctionArn: string;
    secondaryStepfunctionArn: string;

}

export interface RdsConfig {
    account: string,
    primary: string,
    secondary: string
}


export interface ArcCluster {
    clusterName: string
    controlPanel: ControlPanel
    endpoints: Endpoint[]
}

export interface Endpoint {
    region: string
    arn: string
}

export interface ControlPanel{
    controlPanelArn: string
    failoverRoutingControls: RoutingControl
    failbackRoutingControls: RoutingControl
}

export interface RoutingControl {
    primary: string[]
    secondary: string[]
}
