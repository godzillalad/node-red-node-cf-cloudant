/**
 * Copyright 2014,2016 IBM Corp.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing permissions and limitations under the License.
 */
module.exports = function(RED) {
	"use strict";
	var url = require('url');
	var querystring = require('querystring');
	var cfEnv = require("cfenv");
	var Cloudant = require("cloudant");

	var MAX_ATTEMPTS = 3;

	var appEnv = cfEnv.getAppEnv();
	var services = [];

	// load the services bound to this application
	for ( var i in appEnv.services) {
		if (appEnv.services.hasOwnProperty(i)) {
			// filter the services to include only the Cloudant ones
			if (i.match(/^(cloudant)/i)) {
				services = services.concat(appEnv.services[i].map(function(v) {
					return {
						name : v.name,
						label : v.label
					};
				}));
			}
		}
	}

	//
	// HTTP endpoints that will be accessed from the HTML file
	//
	RED.httpAdmin.get('/cloudant/vcap', function(req, res) {
		res.send(JSON.stringify(services));
	});

	//
	// Create and register nodes
	//
	function CloudantNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.host = n.host;
		this.url = n.host;

		// remove unnecessary parts from host value
		var parsedUrl = url.parse(this.host);
		if (parsedUrl.host) {
			this.host = parsedUrl.host;
		}
		if (this.host.indexOf("cloudant.com") !== -1) {
			// extract only the account name
			this.account = this.host.substring(0, this.host.indexOf('.'));
			delete this.url;
		}
		var credentials = this.credentials;
		if ((credentials) && (credentials.hasOwnProperty("username"))) {
			this.username = credentials.username;
		}
		if ((credentials) && (credentials.hasOwnProperty("pass"))) {
			this.password = credentials.pass;
		}
	}
	RED.nodes.registerType("cloudant", CloudantNode, {
		credentials : {
			pass : {
				type : "password"
			},
			username : {
				type : "text"
			}
		}
	});
	
	
	
	

	function CloudantOutNode(n) {
		RED.nodes.createNode(this, n);

		this.operation = n.operation;
		this.payonly = n.payonly || false;
		this.removeidentifiers = n.removeidentifiers || false;
		this.database = _cleanDatabaseName(n.database, this);
		this.cloudantConfig = _getCloudantConfig(n);

		var node = this;
		var credentials = {
			account : node.cloudantConfig.account,
			key : node.cloudantConfig.username,
			password : node.cloudantConfig.password,
			url : node.cloudantConfig.url
		};

		Cloudant(credentials, function(err, cloudant) {
			if (err) {
				node.error(err.message, err);
//				node.status({fill:"red",shape:"ring",text:"disconnected"});
			} else {
//				node.status({fill:"green",shape:"dot",text:"connected"});
				
				// check if the database exists and create it if it doesn't
				createDatabase(cloudant, node);

				node.on("input", function(msg) {
					delete msg._msgid;
					
					handleMessage(cloudant, node, msg);
				});
			}
		});

		function createDatabase(cloudant, node) {
			cloudant.db.list(function(err, all_dbs) {
				if (err) {
					if (err.statusCode === 403) {
						// if err.statusCode is 403 then we are probably using
						// an api key, so we can assume the database already exists
						return;
					}
					node.error("Failed to list databases: " + err.message, err);
				} else {
					if (all_dbs && all_dbs.indexOf(node.database) < 0) {
						cloudant.db.create(node.database, function(err, body) {
							if (err) {
								node.error("Failed to create database: " + err.message, err);
							}
						});
					}
				}
			});
		}

		function handleMessage(cloudant, node, msg) {
			if (node.operation === "insert") {
				
				var msg = node.payonly ? msg.payload : msg;
				var root = node.payonly ? "payload" : "msg";
				var doc = parseMessage(msg, root);
				
				insertDocument(cloudant, node, doc, MAX_ATTEMPTS, function(err, body) {
					if (err) {
						console.trace();
						console.log(node.error.toString());
						node.error("Failed to insert document: " + err.message, msg);
					}
				});
				
			}else if (node.operation === "update") {
				
				// Get the selector
				var selectorField = msg.selector || JSON.parse(msg.payload).selector;
				var selector = {"selector" : selectorField };

				// Node option to only use the msg.payload to update 
				var storeObject = node.payonly ? msg.payload : msg;
				storeObject = JSON.parse(storeObject);
				
				if(typeof(selectorField) == 'undefined' || typeof(storeObject) == 'undefined'){
					
					node.error("Are you passing a selector: '"+ selectorField +"' and object to store: '"+ storeObject+"'")
				}
				else{
					updateFields(cloudant, node, selector, storeObject);
				}
				
			}else if (node.operation === "delete") {
				var doc = parseMessage(msg.payload || msg, "");

				if ("_rev" in doc && "_id" in doc) {
					var db = cloudant.use(node.database);
					db.destroy(doc._id, doc._rev, function(err, body) {
						if (err) {
							node.error("Failed to delete document: " + err.message, msg);
						}
					});
				} else {
					var err = new Error("_id and _rev are required to delete a document");
					node.error(err.message, msg);
				}
			}
		}
		
		function updateFields(cloudant, node, selector, storeObject) {
			
			/**
			 * Update a field in the document in the specified DB using a query to find the object
			 * If multiple documents match the update all documents
			 * 
			 * this update will only be additive it will maintain the original documents fields. 
			 * 
			 * Update will modify an existing object or objects. The query to select objects to update uses msg.selector and the update to the element uses msg.payload
			 * Update can add a object if it does not exist or update multiple objects.
			 * 
			 */

			var db = cloudant.use(node.database);
			
			db.find(selector, function(err, body) {
				if (!err) {
				
					console.log("Selector matched documents", selector);
					
					
					// Clone all of the found docs
					var docsToModify = (JSON.parse(JSON.stringify(body.docs)));
					
					// For each document now search for fields and start replacing them with an insert
					// Note to update individual fileds the whole pobject including _rev, _id are needed before we insert
					if ("docs" in body) {

						if (node.removeidentifiers){
							// In a single update the entire DB could be modified
							// This may be desired so it's wrapped in a "are you really sure" option
							// Were here now and decided to update everything so remove the _id and _rev
							
							if (typeof(storeObject._id) != 'undefined'){
								delete storeObject._id;
							}
							
							if (typeof(storeObject._rev) != 'undefined'){
								delete storeObject._rev;
							}
							
						}
						
						if(typeof(storeObject._id) != 'undefined'){
							// If the msg.payload._id is still present we need to match it 
							console.log("_id passed in msg.payload so trying to match with doc matched with selector: " , storeObject._id);
							
							// Only modify the single doc if _id is passed
							docsToModify = body.docs.filter(function( doc ) {
								  return doc._id == storeObject._id;
							});	
						}
						
						// iterate through docs updating their fields with those in message.payload
						var updateCount = 0;
						
						docsToModify.forEach(function(doc){
							updateCount ++;
							// clone the doc
							var updateDoc = (JSON.parse(JSON.stringify(doc)));
							
							// Merge in the new fields using assign
							updateDoc =  Object.assign(updateDoc, storeObject);
							
							console.log("Merging the two docs into new doc and insert into DB: ", updateDoc);
							insertDocument(cloudant, node, updateDoc, MAX_ATTEMPTS, function(err, body) {
								if (err) {
									console.trace();
									console.log(node.error.toString());
									node.error("Failed to insert document: " + err.message, msg);
								}									
							});
						});
						
						node.log("Number of Document to update:  '"+updateCount+"'");
						
					}else{
						node.warn("No documents matched the selector: ", selector);
					}
						
				} else {
					console.log("Error querying using selector : ", err);
					if (err.message === "missing") {
						node.warn("Document '" + node.inputId + "' not found in database '" + node.database + "'.", err);
					} else {
						node.error(err.description, err);
						node.error(err.message, err);
					}
				}
			});
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
			return cleanMessage(msg);
		}

		// fix field values that start with _
		// https://wiki.apache.org/couchdb/HTTP_Document_API#Special_Fields
		function cleanMessage(msg) {
			for ( var key in msg) {
				if (msg.hasOwnProperty(key) && !isFieldNameValid(key)) {
					// remove _ from the start of the field name
					var newKey = key.substring(1, msg.length);
					msg[newKey] = msg[key];
					delete msg[key];
					node.warn("Property '" + key + "' renamed to '" + newKey + "'.");
				}
			}
			return msg;
		}

		function isFieldNameValid(key) {
			var allowedWords = [ '_id', '_rev', '_attachments', '_deleted', '_revisions', '_revs_info', '_conflicts', '_deleted_conflicts', '_local_seq' ];
			return key[0] !== '_' || allowedWords.indexOf(key) >= 0;
		}

		// Inserts a document +doc+ in a database +db+ that migh not exist
		// beforehand. If the database doesn't exist, it will create one
		// with the name specified in +db+. To prevent loops, it only tries
		// +attempts+ number of times.
		function insertDocument(cloudant, node, doc, attempts, callback) {
			var db = cloudant.use(node.database);
			db.insert(doc, function(err, body) {
				if (err && err.statusCode === 404 && attempts > 0) {
					// statusCode 404 means the database was not found
					return cloudant.db.create(db.config.db, function() {
						insertDocument(cloudant, node, doc, attempts - 1, callback);
					});
				}

				callback(err, body);
			});
		}
	}
	;
	RED.nodes.registerType("cloudant out", CloudantOutNode);

	function CloudantInNode(n) {
		RED.nodes.createNode(this, n);

		this.cloudantConfig = _getCloudantConfig(n);
		this.database = _cleanDatabaseName(n.database, this);
		this.search = n.search;
		this.design = n.design;
		this.index = n.index;
		this.inputId = "";

		var node = this;
		var credentials = {
			account : node.cloudantConfig.account,
			key : node.cloudantConfig.username,
			password : node.cloudantConfig.password,
			url : node.cloudantConfig.url
		};

		Cloudant(credentials, function(err, cloudant) {
			if (err) {
				node.error(err.message, err);
			} else {
				node.on("input", function(msg) {
					var db = cloudant.use(node.database);
					var options = (typeof msg.payload === "object") ? msg.payload : {};

					if (node.search === "_id_") {
						var id = getDocumentId(msg.payload);
						node.inputId = id;

						db.get(id, function(err, body) {
							sendDocumentOnPayload(err, body, msg);
						});
					} else if (node.search === "_idx_") {
						options.query = options.query || options.q || formatSearchQuery(msg.payload);
						options.include_docs = options.include_docs || true;
						options.limit = options.limit || 200;

						db.search(node.design, node.index, options, function(err, body) {
							sendDocumentOnPayload(err, body, msg);
						});
					} else if (node.search === "_all_") {
						options.include_docs = options.include_docs || true;

						db.list(options, function(err, body) {
							sendDocumentOnPayload(err, body, msg);
						});
					} else if (node.search === "_query_") {
						options.selector = options.selector || JSON.parse(msg.payload);
						db.find(options.selector, function(err, body) {
							console.log("err", err);
							if (!err) {
								msg.cloudant = body;

								console.log("body", body);

								if ("docs" in body) {
									msg.payload = body.docs;
								} else {
									msg.payload = [];
									msg.body = body;
								}
							} else {
								msg.payload = null;

								console.log("err", err);
								if (err.message === "missing") {
									node.warn("Document '" + node.inputId + "' not found in database '" + node.database + "'.", err);
								} else {
									node.error(err.description, err);
									node.error(err.message, err);
								}
							}

							node.send(msg);
						});
					}
				});
			}
		});

		function getDocumentId(payload) {
			if (typeof payload === "object") {
				if ("_id" in payload || "id" in payload) {
					return payload.id || payload._id;
				}
			}

			return payload;
		}

		function formatSearchQuery(query) {
			if (typeof query === "object") {
				// useful when passing the query on HTTP params
				if ("q" in query) {
					return query.q;
				}

				var queryString = "";
				for ( var key in query) {
					queryString += key + ":" + query[key] + " ";
				}

				return queryString.trim();
			}
			return query;
		}

		function sendDocumentOnPayload(err, body, msg) {
			if (!err) {
				msg.cloudant = body;

				if ("rows" in body) {
					msg.payload = body.rows.map(function(el) {
						if (el.doc._id.indexOf("_design/") < 0) {
							return el.doc;
						}
					}).filter(function(el) {
						return el !== null && el !== undefined;
					});
				} else {
					msg.payload = body;
				}
			} else {
				msg.payload = null;

				if (err.message === "missing") {
					node.warn("Document '" + node.inputId + "' not found in database '" + node.database + "'.", err);
				} else {
					node.error(err.message, err);
				}
			}

			node.send(msg);
		}
	}
	RED.nodes.registerType("cloudant in", CloudantInNode);

	// must return an object with, at least, values for account, username and
	// password for the Cloudant service at the top-level of the object
	function _getCloudantConfig(n) {
		if (n.service === "_ext_") {
			return RED.nodes.getNode(n.cloudant);

		} else if (n.service !== "") {
			var service = appEnv.getService(n.service);
			var cloudantConfig = {};

			var host = service.credentials.host;

			cloudantConfig.username = service.credentials.username;
			cloudantConfig.password = service.credentials.password;
			cloudantConfig.account = host.substring(0, host.indexOf('.'));

			return cloudantConfig;
		}
	}

	// remove invalid characters from the database name
	// https://wiki.apache.org/couchdb/HTTP_database_API#Naming_and_Addressing
	function _cleanDatabaseName(database, node) {
		var newDatabase = database;

		// caps are not allowed
		newDatabase = newDatabase.toLowerCase();
		// remove trailing underscore
		newDatabase = newDatabase.replace(/^_/, '');
		// remove spaces and slashed
		newDatabase = newDatabase.replace(/[\s\\/]+/g, '-');

		if (newDatabase !== database) {
			node.warn("Database renamed  as '" + newDatabase + "'.");
		}

		return newDatabase;
	}
};
