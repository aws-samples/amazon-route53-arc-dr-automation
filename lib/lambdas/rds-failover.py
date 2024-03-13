import boto3
import time


def lambda_handler(event, context):
    primary_region = event['primary_region']
    secondary_region = event['secondary_region']
    global_table = event['global_table']
    action = event['action']
    delay = 30
    print(event)
    client = boto3.client('rds')
    result = {
        "error": False
    }

    try:
        response = client.describe_global_clusters(
            GlobalClusterIdentifier=global_table,
        )

        members = response['GlobalClusters'][0]['GlobalClusterMembers']
        primary_cluster = [m['DBClusterArn'] for m in members if m['IsWriter'] == True][0]
        secondary_cluster = [m['DBClusterArn'] for m in members if m['IsWriter'] == False][0]

        print("primary writer cluster is {}".format(primary_cluster))
        print("secondary reader cluster is {}".format(secondary_cluster))

        if action == "fail_over" and secondary_region in primary_cluster:
            print("Cluster is already Writer in Secondary Region")
            return result

        if action == "fail_back" and primary_region in primary_cluster:
            print("Cluster is already Writer in Primary Region")
            return result

        target = secondary_cluster
        print(target)

        response = client.failover_global_cluster(
            GlobalClusterIdentifier=global_table,
            TargetDbClusterIdentifier=target
        )

        print(response)

        response = client.describe_global_clusters(
            GlobalClusterIdentifier=global_table,
        )
        while True:
            response = (response['GlobalClusters'][0]['Status'])
            print("Checking for aurora cluster to become available")
            if response == "available":
                break
            response = client.describe_global_clusters(
                GlobalClusterIdentifier=global_table,
            )
            time.sleep(delay)

    except Exception as e:
        print(e)
        result = {
            "error": True,
        }

    return result