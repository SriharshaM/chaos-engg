/**
    to run app on PC modify path on lines specified depending on your own desktop
    In app.py :     line 17 to be commented out as AWS_REGION environment variable may not be needed to be set
 *  In router.js :  lines 20, 21 need path to ~/.aws/credentials or ~/.aws/config
                    line 22 calls app.py on specific path and passes argument to set environment variable
                    line 647 iam role
    Also import the grafana JSON into local grafana to be able to see the graphs properly
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require("node-fetch");
const { exec } = require('child_process')
const { PythonShell } = require('python-shell')
const session = require('express-session')
const router = express.Router()
const AWS = require('aws-sdk')

const cred_file = path.join( '/root','.aws', 'credentials')
const config_file = path.join( '/root','.aws', 'config')
const python_file = path.join('/root','chaos','ChaosProject', 'app.py')

AWS.config.update({region: 'us-east-2'})
var ec2 = new AWS.EC2({apiVersion: '2016-11-15'})
var ssm = new AWS.SSM({apiVersion: '2014-11-06'})

router.get('/', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'home.ejs'))
    sess = req.session
    sess['validation'] = false          // false: validation not yet done(needed) on next form
})

router.get('/documentation', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'documentation.ejs'))
})

router.get('/aws', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'aws.ejs'))
})

router.get('/aws/metrics', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    sess['req_instance_id'] = false
    console.log('hello')
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
        console.log(sess['json_resp'])
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'metrics.ejs'), {
            json_resp : sess['json_resp'],
            req_instance_id : sess['req_instance_id']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
	   
    })
})

router.post('/aws/metrics', (req, res) => {
    sess = req.session
    var instance_id = req.body.instance
    sess['instance_id'] = instance_id
    sess['req_instance_id'] = true
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'metrics.ejs'), {
        json_resp : sess['json_resp'],
        instance_id : sess['instance_id'],
        req_instance_id : sess['req_instance_id']
    })
})

router.get('/aws/auth', (req, res) => {
    var data = fs.readFileSync(cred_file, {encoding:'utf8', flag:'r'}).split('\n')
    sess = req.session
    sess['user_cred'] = data
    if(!sess['validation']){
        sess['validate'] = [false, false, false]
    }
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'auth.ejs'), {
        cred : sess['user_cred'],
        validate : sess['validate']
    })
})

router.post('/aws/auth', (req, res) => {
    sess = req.session
    var authenticate = new Promise((resolve, reject) => {
        done = true
        if(!req.body.prev_creds){
            if(req.body.access_key !== '' && req.body.secret_access_key !== '' && req.body.region !== ''){
                data1 = `[default]\naws_access_key_id = ${req.body.access_key}\naws_secret_access_key = ${req.body.secret_access_key}\nregion = ${req.body.region}`
                data2 = `[default]\nregion = ${req.body.region}`
                fs.writeFile(cred_file, data1, (err)=>{
                    if(err) {
                        done = false
                    }
                })
                fs.writeFile(config_file, data2, (err)=>{
                    if(err) {
                        done = false
                    }
                })
               
                sess['validation'] = false
            }
            else{
                if(req.body.access_key === ''){
                    sess['validate'][0] = true    // true : user has left field empty
                }else{
                    sess['validate'][0] = false
                }
                if(req.body.secret_access_key === ''){
                    sess['validate'][1] = true    // true : user has left field empty
                }else{
                    sess['validate'][1] = false
                }
                if(req.body.region === ''){
                    sess['validate'][2] = true    // true : user has left field empty
                }else{
                    sess['validate'][2] = false
                }
                sess['validation'] = true   // validation has been done redirection to same page
                res.redirect('/aws/auth')
            }
        }
        else{
            
            sess['validation'] = false
        }
        if (done) {
            resolve();
        }
    });
    
    authenticate.then(function () {
        sess['user_history'] = []
	sess['litmus_history'] = []
        sess['ssm_user_history'] = []
        if(!sess['validation']){
            res.redirect('/aws/auth_success')
        }
    })
})

router.get('/aws/auth_success', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'auth_success.ejs'))
})

router.post('/aws/auth_success', (req, res) => {
    console.log(req.body.service)
    if(req.body.service === 'ec2'){
        res.redirect('/aws/ec2')
    }
    if(req.body.service === 'ssm'){
        res.redirect('/aws/ssm')
    }
    if(req.body.service === 'litmus'){
        res.redirect('/aws/litmus')
    }
})

router.get('/aws/litmus', (req, res) => {
    sess = req.session
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'litmus', 'litmus.ejs'), {
        litmus_history : sess['litmus_history']
    })
})

router.post('/aws/litmus', (req, res) => {
    console.log(req.body.module)
    if(req.body.module === 'ec2_terminate_by_id'){
        res.redirect('/aws/litmus_ec2_terminate')
    }
})

router.get('/aws/litmus_ec2_terminate', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running', 'pending']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'litmus', 'litmus_ec2_terminate.ejs'), {
            json_resp : sess['json_resp'],
            litmus_history : sess['litmus_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/litmus_ec2_terminate', (req, res) => {
    sess = req.session
    json_req = `{"service": "litmus", "exp": "ec2_terminate"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`
    json_req += `}`
    console.log(json_req)
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
		console.log(text)
                sess['json_type'] = 'Litmus Terminate'
                sess['json_response'] = text
                sess['error_encountered'] = false
                var today = new Date()
                sess['litmus_history'].unshift(JSON.parse('{ "type" : "Litmus Terminate", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
		console.log(err)
                sess['error_encountered'] = true
                sess['json_type'] = 'Litmus Terminate'
                sess['json_response'] = text
                var today = new Date()
                sess['litmus_history'].unshift(JSON.parse('{ "type" : "Litmus Terminate", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/litmus_result')
    })
})

router.get('/aws/litmus_result', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'litmus', 'result.ejs'), {
        json_type : sess['json_type'],
        json_response: sess['json_response'],
        litmus_history : sess['litmus_history'],
        error_encountered : sess['error_encountered']
    })
})

router.get('/aws/ec2', (req, res) => {
    sess = req.session
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2.ejs'), {
        user_history : sess['user_history']
    })
})

router.post('/aws/ec2', (req, res) => {
    console.log(req.body.module)
	json_req=`{"experiment_template":"${req.body.module[1]}"}`
    if(req.body.module === 'stop_instances'){
        res.redirect('/aws/ec2_stop')
    }
    if(req.body.module === 'terminate_instances'){
        res.redirect('/aws/ec2_terminate')
    }
    if(req.body.module === 'start_instances'){
        res.redirect('/aws/ec2_start')
    }
    if(req.body.module === 'restart_instances'){
        res.redirect('/aws/ec2_restart')
    }
    if(req.body.module === 'describe_instances'){
        res.redirect('/aws/ec2_describe')
    }
    if(req.body.module==='failover_rds'){
	res.redirect('/aws/failover_rds')
    }
    if(req.body.module === 'describe_db_clusters'){
        res.redirect('/aws/describe_db_clusters') 
    }
    if(req.body.module === 'stop_experiment'){
        res.redirect('/aws/stop_experiment')
    }
    if(req.body.module === 'start_experiment'){
        res.redirect('/aws/start_experiment')
    }
    if(req.body.module === 'get_experiment'){
        res.redirect('/aws/get_experiment')
    }	
})
router.get('/aws/stop_experiment', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running', 'pending']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'stop_experiment.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/stop_experiment', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "stop_experiment"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`

    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    if(req.body.force){
        json_req += `,"force": true`
    }
    else{
        json_req += `,"force": false`
    }
    json_req += `}`
    console.log(json_req)

    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'stopexperiment'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'stop'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }

    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})
router.get('/aws/start_experiment', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['stopped', 'stopping']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'start_experiment.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/start_experiment', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "start_experiment"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`

    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    json_req += `}`

    console.log(json_req)

    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'startexperiment'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Start Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'start'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Start Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }

    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})
router.get('/aws/get_experiment', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'get_experiment.ejs'), {
        user_history : sess['user_history']
    })
})

router.post('/aws/get_experiment', (req, res) => {
    json_req = `{"service": "ec2", "exp": "get_experiment"`
    json_req += `, "filters": [{`
    json_req += `"Name" : "${req.body.filter_name}"`
    json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    json_req += `}`

    console.log(json_req)
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            sess = req.session
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'getexperiment'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "DescribeDBCluster", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'describe'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "DescribeDBCluster", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }

    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})

router.get('/aws/describe_db_clusters', (req, res) => {
	sess = req.session
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'describe_db_clusters.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
    })
})

router.post('/aws/describe_db_clusters', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "describe_db_clusters"`
    json_req += `,"db_cluster": "${req.body.cluster}"`
	//json_req += `,"target_db_instance": "${req.body.instance}"`
    //json_req += `}`	
    json_req += `, "filters": [{`
    json_req += `"Name" : "${req.body.filter_name}"`
    json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    json_req += `}`
	
	
	
    console.log(json_req)
	    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'describedb'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Describe Cluster", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'describedb'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Describe Cluster", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})


router.get('/aws/failover_rds', (req, res) => {
	sess = req.session
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'failover_rds.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
    })
})

router.post('/aws/failover_rds', (req, res) => {
    sess = req.session
	json_req = `{"service": "ec2", "exp": "failover_rds"`
    json_req += `,"db_cluster": "${req.body.cluster}"`
	json_req += `,"target_db_instance": "${req.body.instance}"`
	json_req += `}`
    console.log(json_req)
	    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'failover'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'failover'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' +
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }

    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})

router.get('/aws/ec2_stop', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running', 'pending']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2_stop.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/ec2_stop', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "stop_instances"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`

    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    if(req.body.force){
        json_req += `,"force": true`
    }
    else{
        json_req += `,"force": false`
    }
    json_req += `}`
    console.log(json_req)
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'stop'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'stop'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Stop Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})

router.get('/aws/ec2_terminate', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running', 'stopped', 'stopping', 'pending']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2_terminate.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/ec2_terminate', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "terminate_instances"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`

    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    json_req += `}`
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            sess = req.session
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'terminate'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Terminate Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'stop'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Terminate Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})


router.get('/aws/ec2_start', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['stopped', 'stopping']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2_start.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/ec2_start', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "start_instances"`
    json_req += `,"id": `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}`

    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    json_req += `}`
    
    console.log(json_req)

    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'start'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Start Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'start'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Start Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})


router.get('/aws/ec2_restart', (req, res) => {
    var params = {
        Filters: [{
            Name: 'instance-state-name',
            Values: ['running', 'pending']
        }]
    }
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2_restart.ejs'), {
            json_resp : sess['json_resp'],
            user_history : sess['user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/ec2_restart', (req, res) => {
    sess = req.session
    json_req = `{"service": "ec2", "exp": "restart_instances"`
    json_req += `,"id":`
    
    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }

    json_req += `${JSON.stringify(selected_ids)}`
    json_req += `,"az": "${req.body.az}"`
    json_req += `, "filters": [{`
    if(req.body.az !== '' && req.body.filter_name === undefined){
        json_req += `"Name" : "availability-zone"`
        json_req += `, "Values" : [${JSON.stringify(req.body.az)}]}]`
    }else{
        json_req += `"Name" : "${(req.body.filter_name === undefined) ? "" : req.body.filter_name}"`
        json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    }
    json_req += `}`
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(json => {
            console.log(json)
            sess['json_type'] = 'restart'
            sess['json_response'] = json
            var today = new Date()
            sess['user_history'].unshift(JSON.parse('{ "type" : "Restart Instance", "TimeCompleted" : "' + 
            today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
            +'", "status" : "Completed"}'))
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})

router.get('/aws/ec2_describe', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'ec2_describe.ejs'), {
        user_history : sess['user_history']
    })
})

router.post('/aws/ec2_describe', (req, res) => {
    json_req = `{"service": "ec2", "exp": "describe_instances"`
    json_req += `, "filters": [{`
    json_req += `"Name" : "${req.body.filter_name}"`
    json_req += `, "Values" : ${JSON.stringify(req.body.filter_value.split(","))}}]`
    json_req += `}`
    
    console.log(json_req)
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            sess = req.session
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'describe'
                sess['json_response'] = data
                sess['error_encountered'] = false
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Describe Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'describe'
                sess['json_response'] = text
                var today = new Date()
                sess['user_history'].unshift(JSON.parse('{ "type" : "Describe Instance", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/result')
    })
})

router.get('/aws/result', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ec2', 'result.ejs'), {
        json_type : sess['json_type'],
        json_response: sess['json_response'],
        user_history : sess['user_history'],
        error_encountered : sess['error_encountered']
    })
})

router.get('/aws/ssm', (req, res) => {
    sess = req.session
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ssm', 'ssm.ejs'), {
        ssm_user_history : sess['ssm_user_history']
    })
})

router.post('/aws/ssm', (req, res) => {
    console.log(req.body.filter_name)
    if(req.body.filter_name === 'AWSFIS-Run-CPU-Stress'){
        res.redirect('/aws/ssm_cpu_stress')
    }
    if(req.body.filter_name === 'AWSFIS-Run-Memory-Stress'){
        res.redirect('/aws/ssm_mem_stress')
    }
})

router.get('/aws/ssm_cpu_stress', (req, res) => {
    var params = {}
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ssm', 'ssm_cpu_stress.ejs'), {
            json_resp : sess['json_resp'],
            ssm_user_history : sess['ssm_user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
	console.log(err)
    })
})

router.post('/aws/ssm_cpu_stress', (req, res) => {
    sess = req.session
    json_req = `{"service": "ssm", "exp": "send_command"`
    json_req += `,"document_name": "Copy-AWSFIS-Run-CPU-Stress"`
    json_req += `, "targets": [{"Key" : "Instanceids",`
    json_req += `"Values" : `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}}]`

    json_req += `,"document_version": "${req.body.document_version}"`
    json_req += `,"parameters": {"CPU" : ["${req.body.cpu}"]`
    json_req += `,"InstallDependencies": ["${(req.body.dependencies === 'true' ? "True" : "False")}"]`
    json_req += `,"DurationSeconds": ["${req.body.duration}"]}`
    json_req += `,"timeout_seconds" : ${(req.body.timeout === '' ? 60 : req.body.timeout)}`
    json_req += `,"max_concurrency" : "${(req.body.max_concurrency === '' ? "50" : req.body.max_concurrency)}"`
    json_req += `,"max_error" : "${(req.body.max_error === '' ? "0" : req.body.max_error)}"`
    json_req += `}`

    console.log(json_req)
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'ssm_cpu'
                sess['json_response'] = data
                sess['error_encountered'] = false
                console.log(sess['json_response'])
                var today = new Date()
                sess['ssm_user_history'].unshift(JSON.parse('{ "type" : "CPU Stress", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'ssm_cpu'
                sess['json_response'] = text
                console.log(sess['json_response'])
                var today = new Date()
                sess['ssm_user_history'].unshift(JSON.parse('{ "type" : "CPU Stress", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/ssm_result')
    })
})

router.get('/aws/ssm_mem_stress', (req, res) => {
    var params = {}
/*        Filters: [{
            Name: 'iam-instance-profile.arn',
            Values: ['arn:aws:iam::545351415800:instance-profile/ChaosSSM']
        }]
*/  
    sess = req.session
    sess['json_resp'] = {}
    var fetch_instances = ec2.describeInstances(params, (err, data) => {
        if (err) {}
    }).promise()
    fetch_instances.then(res => {
        sess['json_resp'] = res
    })
    .then(() => {
        res.render(path.join(__dirname , 'public', 'html', 'aws', 'ssm', 'ssm_mem_stress.ejs'), {
            json_resp : sess['json_resp'],
            ssm_user_history : sess['ssm_user_history']
        })
    })
    .catch(err => {
        console.log('Please restart the app')
    })
})

router.post('/aws/ssm_mem_stress', (req, res) => {
    sess = req.session
    json_req = `{"service": "ssm", "exp": "send_command"`
    json_req += `,"document_name": "Copy-AWSFIS-Run-Memory-Stress"`
    json_req += `, "targets": [{"Key" : "Instanceids",`
    json_req += `"Values" : `

    var selected = ""
    var selected_ids = []
    for(i in sess['json_resp'].Reservations){
        selected = sess['json_resp'].Reservations[i].Instances[0].InstanceId
        if(req.body[selected])
        {
            selected_ids.push(selected)
        }
    }
    json_req += `${JSON.stringify(selected_ids)}}]`

    json_req += `,"document_version": "${req.body.document_version}"`
    json_req += `,"parameters": {"Workers" : ["${req.body.workers}"]`
    json_req += `,"InstallDependencies": ["${(req.body.dependencies === 'true' ? "True" : "False")}"]`
    json_req += `,"DurationSeconds": ["${req.body.duration}"]`
    json_req += `,"Percent": ["${req.body.percent}"]}`
    json_req += `,"timeout_seconds" : ${(req.body.timeout === '' ? 60 : req.body.timeout)}`
    json_req += `,"max_concurrency" : "${(req.body.max_concurrency === '' ? "50" : req.body.max_concurrency)}"`
    json_req += `,"max_error" : "${(req.body.max_error === '' ? "0" : req.body.max_error)}"`
    json_req += `}`

    console.log(json_req)
    
    async function fetch_api(){
        const response = await fetch('http://127.0.0.1:5000/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: json_req,
        })
        .then(res => res.text())
        .then(text => {
            try {
                const data = JSON.parse(text);
                sess['json_type'] = 'ssm_mem'
                sess['json_response'] = data
                sess['error_encountered'] = false
                console.log(sess['json_response'])
                var today = new Date()
                sess['ssm_user_history'].unshift(JSON.parse('{ "type" : "Memory Stress", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Completed"}'))
            } catch(err) {
                sess['error_encountered'] = true
                sess['json_type'] = 'ssm_mem'
                sess['json_response'] = text
                console.log(sess['json_response'])
                var today = new Date()
                sess['ssm_user_history'].unshift(JSON.parse('{ "type" : "Memory Stress", "TimeCompleted" : "' + 
                today.getHours().toString() + ':' + today.getMinutes().toString() + ':' + today.getSeconds().toString()
                +'", "status" : "Failed"}'))
            }
        })
    }
    
    fetch_api().then(response => {
        res.redirect('/aws/ssm_result')
    })
})

router.get('/aws/ssm_result', (req, res) => {
    res.render(path.join(__dirname , 'public', 'html', 'aws', 'ssm', 'result.ejs'), {
        json_type : sess['json_type'],
        json_response: sess['json_response'],
        ssm_user_history : sess['ssm_user_history'],
        error_encountered : sess['error_encountered']
    })
})


module.exports = router
