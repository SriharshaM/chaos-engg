from flask import Flask, request, json
import random
import json
import chaosaws.ec2.actions
import chaosaws.ssm.actions
import chaosaws.ec2.probes
import chaosaws.rds.actions
import chaosaws.rds.probes
#from rds_probes import describe_db_cluster
#import chaosaws.fis.probes
#import chaosaws.fis.actions
import sys, os,subprocess,time

#from typing import Any, Dict, List, Union
import boto3
#from chaosaws import aws_client
#from chaosaws.types import AWSResponse
client = boto3.client('rds')
app = Flask(__name__)

@app.route('/', methods=['GET'])
def hello():
    stri = "<h1>he" + str(random.random()) + "</h1>"
    return stri

'''def describe_db_cluster(
     cluster_id: str = None, filters: List[Dict[str, Any]] = None
) -> AWSResponse:
    paginator = client.get_paginator("describe_db_clusters")
    params = dict()

    if cluster_id:
        params["DBClusterIdentifier"] = cluster_id
    if filters:
       params["Filters"] = filters

    results = {}
    for p in paginator.paginate(**params):
        results.setdefault("DBClusters", []).extend(p["DBClusters"])
    logger.info("found %s clusters" % len(results["DBClusters"]))
    return results
'''
'''def describe_db_cluster(
     cluster_id: str = None, filters: List[Dict[str, Any]] = None
) -> AWSResponse:
    client = boto3.client('rds')
    response = client.describe_db_clusters(
        DBClusterIdentifier='string',
        Filters=[
            {
                'Name': 'string',
                'Values': [
                    'string',
                ]
            },
        ],
        MaxRecords=123,
        Marker='string',
        IncludeShared=True|False
    )
    return response
'''
@app.route('/', methods=['POST'])
def home1():
    os.environ["AWS_REGION"] = str(sys.argv[1])
    result = ""
    try:
        record = json.loads(request.data)
        if record["service"] == "test":
            res={"service":"test"}
            result= json.dumps(res)
        if record["service"] == "ec2":
            if record["exp"]== "stop_instances":
                result = (chaosaws.ec2.actions.stop_instances(record["id"],record["az"],record["filters"],record["force"]))[0]
            elif record["exp"]== "start_instances":
                result = json.dumps((chaosaws.ec2.actions.start_instances(record["id"],record["az"],record["filters"])))
            elif record["exp"]== "restart_instances":
                l = (chaosaws.ec2.actions.restart_instances(record["id"],record["az"],record["filters"]))
                result = "Instance(s) restarted successfully"
            elif record["exp"]== "terminate_instances":
                result = (chaosaws.ec2.actions.terminate_instances(record["id"],record["az"],record["filters"]))[0]
            elif record["exp"]== "describe_instances":
                result = (chaosaws.ec2.probes.describe_instances(record["filters"]))
            elif record["exp"]== "describe_db_clusters":
               # result= (chaosaws.rds.probes.describe_db_cluster(record["db_cluster"]))
               # result = (describe_db_clusters(record["db_cluster"]))
                result = (client.describe_db_clusters(DBClusterIdentifier=record["db_cluster"],Filters=record["filters"]))
            elif record["exp"]== "failover_rds":
                result= (chaosaws.rds.actions.failover_db_cluster(record["db_cluster"],record["target_db_instance"]))
          # elif record["exp"]== "stop_experiment":
               # result = (chaosaws.fis.actions.stop_experiment(record["id"],record["az"],record["filters"],record["force"]))[0]
          #  elif record["exp"]== "start_experiment":
               # result = (chaosaws.fis.actions.start_experiment(record["id"],record["az"],record["filters"]))
          #  elif record["exp"]== "get_experiment":
              #  result = (chaosaws.ec2.probes.get_experiment(record["filters"]
            print(result)
        if record["service"] == "ssm":
            if record["exp"]== "send_command":
                result = chaosaws.ssm.actions.send_command(record["document_name"],record["targets"],record["document_version"],record["parameters"],record["timeout_seconds"],record["max_concurrency"],record["max_error"])
            print (result)
        if record["service"] == "litmus":
            if record["exp"]== "ec2_terminate":
                subprocess.run(['minikube','start'])
                time.sleep(2)
                subprocess.run(['minikube','status'])
                subprocess.run(['kubectl', 'apply', '-f','https://litmuschaos.github.io/litmus/litmus-operator-v1.13.8.yaml'])
                subprocess.run(['kubectl', 'apply', '-f','https://hub.litmuschaos.io/api/chaos/1.13.8?file=charts/kube-aws/ec2-terminate-by-id/experiment.yaml'])
                subprocess.run(['kubectl', 'apply', '-f','/root/secrets.yml'])
                subprocess.run(['kubectl', 'apply', '-f','/root/rbac.yml'])
                subprocess.run(['kubectl', 'apply', '-f','/root/engine.yml'])
                #time.sleep(100)
                #subprocess.run(['minikube','stop'])
                result = "Litmus EC2 Terminate executed successfully"
            print (result)
    except Exception as e:
        print (e.args)
        result = str(e.args)
    return result

@app.errorhandler(404)
def page_not_found(e):
    return "<h1>404</h1><p>The resource could not be found.</p>", 404

app.run(host='0.0.0.0')
