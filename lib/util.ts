import {ArcCluster, Endpoint, RoutingControl} from "./types/route53ArcConfig";


export function generateEndpointDocument(arcCluster: ArcCluster) {
    return {
        'arcClusterName': {"S": arcCluster.clusterName},
        'endpoints': {"L": createEndpoints(arcCluster.endpoints)}
    }
}


export function generateFailoverRoutingControlsDocument(arcCluster: ArcCluster){
    return {
        'arcClusterName': {"S": arcCluster.clusterName},
        'controlPanelArn': {"S":arcCluster.controlPanel.controlPanelArn},
        'routingControls': createRoutingControls(arcCluster.controlPanel.failoverRoutingControls),
    }
}

export function generateFailbackRoutingControlsDocument(arcCluster: ArcCluster){
    return {
        'arcClusterName': {"S": arcCluster.clusterName},
        'controlPanelArn': {"S": arcCluster.controlPanel.controlPanelArn},
        'routingControls':  createRoutingControls(arcCluster.controlPanel.failbackRoutingControls),
    }
}
export function createRoutingControls(routingControl: RoutingControl){
    return {
        "M": {
            'primary': {"L": createRoutingControlArray(routingControl.primary)},
            'secondary': {"L": createRoutingControlArray(routingControl.secondary)},
        }
    }
}


function createEndpoints(endpoints: Endpoint[]) {
    // @ts-ignore
    const arr = []
    endpoints.forEach((element: Endpoint) => {
        arr.push(createEndpoint(element))
    });
    // @ts-ignore
    return arr
}

function createRoutingControlArray(routingControls: string[]) {
    // @ts-ignore
    const arr = []
    routingControls.forEach((element: string) => {
        arr.push({"S": element})
    });
    // @ts-ignore
    return arr
}


function createEndpoint(element: Endpoint) {
    return {
        "M": {
            "region": {"S": element.region},
            "arn": {"S": element.arn},
        }
    }
}


