import time
import boto3 as boto3
import random
import os
from boto3.dynamodb.conditions import Key


def create_recovery_client(cluster_endpoint):
    """
    Creates a Boto3 Route 53 Application Recovery Controller client for the specified
    cluster endpoint URL and AWS Region.

    param cluster_endpoint: The cluster endpoint URL and Region.
    return: The Boto3 client.
    """
    return boto3.client(
        'route53-recovery-cluster',
        endpoint_url=cluster_endpoint['arn'],
        region_name=cluster_endpoint['region'])


def get_routing_control_state(routing_control_arn, cluster_endpoints):
    """
    Gets the state of a routing control. Cluster endpoints are tried in
    sequence until the first successful response is received.

    param routing_control_arn: The ARN of the routing control to look up.
    param cluster_endpoints: The list of cluster endpoints to query.
    return: The routing control state response.
    """

    # As a best practice, we recommend choosing a random cluster endpoint to get or set routing control states. For
    # more information, see https://docs.aws.amazon.com/r53recovery/latest/dg/route53-arc-best-practices.html#route53
    # -arc-best-practices.regional
    random.shuffle(cluster_endpoints)
    for cluster_endpoint in cluster_endpoints:
        try:
            recovery_client = create_recovery_client(cluster_endpoint)
            response = recovery_client.get_routing_control_state(
                RoutingControlArn=routing_control_arn)
            return response
        except Exception as error:
            raise error


def update_routing_control_state(
        routing_control_arn, cluster_endpoints, routing_control_state):
    """
    Updates the state of a routing control. Cluster endpoints are tried in
    sequence until the first successful response is received.

    param routing_control_arn: The ARN of the routing control to update the state for.
    param cluster_endpoints: The list of cluster endpoints to try.
    param routing_control_state: The new routing control state.
    return: The routing control update response.
    """

    # As a best practice, we recommend choosing a random cluster endpoint to get or set routing control states. For
    # more information, see https://docs.aws.amazon.com/r53recovery/latest/dg/route53-arc-best-practices.html#route53
    # -arc-best-practices.regional
    random.shuffle(cluster_endpoints)
    for cluster_endpoint in cluster_endpoints:
        try:
            recovery_client = create_recovery_client(cluster_endpoint)
            response = recovery_client.update_routing_control_state(
                RoutingControlArn=routing_control_arn,
                RoutingControlState=routing_control_state)
            return response
        except Exception as error:
            raise error


def list_routing_controls_arns(control_plane_arn, cluster_endpoints):
    random.shuffle(cluster_endpoints)
    for cluster_endpoint in cluster_endpoints:
        try:
            recovery_client = create_recovery_client(cluster_endpoint)
            response = recovery_client.list_routing_controls(
                ControlPanelArn=control_plane_arn
            )
            return response['RoutingControls']
        except Exception as error:
            raise error


def retrieve_config_dynamodb_table(table, pk):
    try:
        dyn_resource = boto3.resource('dynamodb')
        table = dyn_resource.Table(table)
        response = table.get_item(Key={'arcClusterName': pk})
        return response['Item']
    except Exception as error:
        print("Could not retrieve configuration ")
        raise error


def handle_fail_over(r_map, desired_state, cluster_endpoints):
    routing_controls = None
    if desired_state == "Off":
        routing_controls = r_map['primary']
    else:
        routing_controls = r_map['secondary']

    for r in routing_controls:
        routing_control_arn = r['arn']
        routing_control_name = r['name']
        try:
            current_state = get_routing_control_state(routing_control_arn, cluster_endpoints)['RoutingControlState']
            if desired_state == current_state:
                print("No action as desired state matches current state")
                continue

            print("Updating routing control with name {}".format(routing_control_name))
            update_routing_control_state(routing_control_arn, cluster_endpoints=cluster_endpoints,
                                         routing_control_state=desired_state)

            time.sleep(delay)

        except Exception as error:
            print("Exception while handling routing control {}".format(routing_control_name))
            raise error


def handle_fail_back(r_map, desired_state, cluster_endpoints):
    routing_controls = None
    if desired_state == "Off":
        routing_controls = r_map['secondary']
    else:
        routing_controls = r_map['primary']

    for r in routing_controls:
        routing_control_arn = r['arn']
        routing_control_name = r['name']
        try:
            current_state = get_routing_control_state(routing_control_arn, cluster_endpoints)['RoutingControlState']
            if desired_state == current_state:
                print("No action as desired state matches current state")
                continue
            print("Updating routing control with name {}".format(routing_control_name))
            update_routing_control_state(routing_control_arn, cluster_endpoints=cluster_endpoints,
                                         routing_control_state=desired_state)

            time.sleep(delay)
        except Exception as error:
            print("Exception while handling routing control {}".format(routing_control_name))
            raise error


def retrieve_cluster_endpoints(table, pk):
    try:
        dyn_resource = boto3.resource('dynamodb')
        table = dyn_resource.Table(table)
        key_condition_expression = Key('arcClusterName').eq(pk)
        response = table.query(KeyConditionExpression=key_condition_expression)
        return response['Items'][0]['endpoints']
    except Exception as error:
        print("Could not retrieve Cluster endpoints")
        raise error


def get_arn_for_name(routing_controls_map, cluster_endpoints):
    control_plane_arn = routing_controls_map['controlPanelArn']
    result = {"primary": [], "secondary": []}

    routing_controls_list = list_routing_controls_arns(control_plane_arn, cluster_endpoints)

    for rc in routing_controls_map['routingControls']['primary']:
        for r in routing_controls_list:
            if rc == r['RoutingControlName']:
                result['primary'].append({
                    "name": rc,
                    "arn": r['RoutingControlArn']
                })
                continue

    for rc in routing_controls_map['routingControls']['secondary']:
        for r in routing_controls_list:
            if rc == r['RoutingControlName']:
                result['secondary'].append({
                    "name": rc,
                    "arn": r['RoutingControlArn']
                })
                continue

    if len(result['primary']) != len(result['secondary']):
        raise Exception("Mismatch in routing controls in primary and secondary")

    return result

delay=int(os.environ["DELAY"])

def lambda_handler(event, context):
    lambda_results = {
        "error": False
    }
    try:
        endpoint_table = event['endpoint_table']
        fail_over_table = event['failover_table']
        fail_back_table = event['failback_table']
        action = event['action']
        arc_cluster = event['arc_cluster']
        desired_state = event['desired_state']

        cluster_endpoints = retrieve_cluster_endpoints(endpoint_table, arc_cluster)

        if action == "fail_over":
            routing_controls_map = retrieve_config_dynamodb_table(fail_over_table, arc_cluster)
        else:
            routing_controls_map = retrieve_config_dynamodb_table(fail_back_table, arc_cluster)

        result = get_arn_for_name(routing_controls_map, cluster_endpoints)
        if action == "fail_over":
            handle_fail_over(result, desired_state, cluster_endpoints)
        else:
            handle_fail_back(result, desired_state, cluster_endpoints)
    except KeyError as e:
        print("Could not update the routing control as mandatory input missing: {}".format(e))
        lambda_results['error'] = True
    except Exception as error:
        print("Could not update the routing control to desired state: {}", error)
        lambda_results['error'] = True

    return lambda_results
