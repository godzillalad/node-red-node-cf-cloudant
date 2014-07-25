/**
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var url         = require('url');
var querystring = require('querystring');
var cfEnv       = require("cf-env");
var RED         = require(process.env.NODE_RED_HOME + "/red/red");

var cfCore   = cfEnv.getCore();
var services = [];

// load the services bindded to this application
for (var i in cfCore.services) {
    // filter the services to include only the Cloudant ones
    if (i.match(/^(cloudant)/i)) {
        services = services.concat(cfCore.services[i].map(function(v) {
            return { name: v.name, label: v.label };
        }));
    }
}

//
// HTTP endpoints that will be accessed from the HTML file
//
RED.httpAdmin.get('/cloudant/vcap', function(req,res) {
    res.send(JSON.stringify(services));
});

// REMINDER: routes are order dependent
RED.httpAdmin.get('/cloudant/:id', function(req,res) {
    var credentials = RED.nodes.getCredentials(req.params.id);

    if (credentials) {
        res.send(JSON.stringify(
          {
              user: credentials.user,
              hasPassword: (credentials.password && credentials.password !== "")
          }
        ));
    } else {
        res.send(JSON.stringify({}));
    }
});

RED.httpAdmin.delete('/cloudant/:id', function(req,res) {
    RED.nodes.deleteCredentials(req.params.id);
    res.send(200);
});

RED.httpAdmin.post('/cloudant/:id', function(req,res) {
    var body = "";

    req.on('data', function(chunk) {
        body += chunk;
    });

    req.on('end', function() {
        var newCreds = querystring.parse(body);
        var credentials = RED.nodes.getCredentials(req.params.id) || {};

        if (newCreds.user == null || newCreds.user == "") {
            delete credentials.user;
        } else {
            credentials.user = newCreds.user;
        }

        if (newCreds.password == "") {
            delete credentials.password;
        } else {
            credentials.password = newCreds.password || credentials.password;
        }

        RED.nodes.addCredentials(req.params.id, credentials);
        res.send(200);
    });
});

//
// Create and register nodes
//
function CloudantNode(n) {
    RED.nodes.createNode(this, n);

    this.name     = n.name;
    this.hostname = n.hostname;

    var credentials = RED.nodes.getCredentials(n.id);
    if (credentials) {
        this.username = credentials.user;
        this.password = credentials.password;
    }

    var parsedUrl = url.parse(this.hostname);
    var authUrl   = parsedUrl.protocol+'//';

    if (this.username && this.password) {
        authUrl += this.username + ":" + encodeURIComponent(this.password) + "@";
    }
    authUrl += parsedUrl.hostname;

    this.url = authUrl;
}
RED.nodes.registerType("cloudant", CloudantNode);

function CloudantOutNode(n) {
    RED.nodes.createNode(this,n);

    this.operation      = n.operation;
    this.payonly        = n.payonly || false;
    this.database       = n.database;
    this.cloudant       = n.cloudant;

    if (n.service == "_ext_") {
        var cloudantConfig = RED.nodes.getNode(this.cloudant);
        if (cloudantConfig) {
            this.url = cloudantConfig.url;
        }
    }
    else if (n.service != "") {
        var cloudantConfig = cfEnv.getService(n.service);
        if (cloudantConfig) {
            this.url = cloudantConfig.credentials.url;
        }
    }

    if (this.url) {
        var node = this;

        var nano = require('nano')(this.url);
        var db   = nano.use(node.database);

        // check if the database exists and create it if it doesn't
         nano.db.list(function(err, body) {
             if (err) { node.error(err); }
              else {
                 if (body && body.indexOf(node.database) < 0) {
                     nano.db.create(node.database, function(err, body) {
                         if (err) { node.error(err); }
                     });
                 }
             }
         });

        node.on("input", function(msg) {
            if (node.operation === "insert") {
                var msg  = node.payonly ? msg.payload : msg;
                var root = node.payonly ? "payload" : "msg";
                var doc  = parseMessage(msg, root);

                db.insert(doc, function(err, body) {
                    if (err) { node.error(err); }
                });
            }
            else if (node.operation === "delete") {
                var doc = parseMessage(msg.payload || msg, "");
                
                if ("_rev" in doc && "_id" in doc) {
                    db.destroy(doc._id, doc._rev, function(err, body) {
                        if (err) { node.error(err); }
                    });
                } else {
                    node.error("_rev and _id are required to delete a document");
                }
            }
        });

    } else {
        this.error("missing cloudant configuration");
    }

    function parseMessage(msg, root) {
        if (typeof msg !== "object") {
            try {
                msg = JSON.parse(msg);

                // JSON.parse accepts numbers, so make sure that an
                // object is return, otherwise create a new one
                if (typeof msg !== "object") {
                    msg = JSON.parse('{"' + root + '":"' + msg + '"}');
                }
            } catch (e) {
                // payload is not in JSON format
                msg = JSON.parse('{"' + root + '":"' + msg + '"}');
            }
        }
        return msg;
    }
};
RED.nodes.registerType("cloudant out", CloudantOutNode);