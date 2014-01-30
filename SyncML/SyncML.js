//JSLint options:
/*global AjaxCall, console.log, console.logToApp, console.error, syncMLMessage, Base64, setTimeout, ajaxCallPost */

"use strict";
var SyncMLModes = {
    "two-way":             "200", // TWO-WAY Specifies a client-initiated, two-way synchronization.
    "slow":                "201", // SLOW SYNC Specifies a client-initiated, two-way slow-synchronization.
    "one-way-from-client": "202", // ONE-WAY FROM CLIENT Specifies the client-initiated, one-way only synchronization from the client to the server.
    "refresh-from-client": "203", // REFRESH FROM CLIENT Specifies the client-initiated, refresh operation for the oneway only synchronization from the client to the server.
    "one-way-from-server": "204", // ONE-WAY FROM SERVER Specifies the client-initiated, one-way only synchronization from the server to the client.
    "refresh-from-server": "205" // REFRESH FROM SERVER Specifies the client-initiated, refresh operation of the one-way only synchronization from the server to the client.
  };

//Other SyncML Alert Codes:
//https://core.forge.funambol.org/wiki/SyncMLAlertCodes
var SyncMLAlertCodes = {
    "100": "show", //data should be shown to client.
    //client-initiated sync modes:
    "200": "two-way",
    "201": "slow",
    "202": "one-way-from-client",
    "203": "refresh-from-client",
    "204": "one-way-from-server",
    "205": "refresh-from-server",
    //server-initiated sync modes:
    "206": "two-way-by-server",
    "207": "one-way-from-client-by-server",
    "208": "refresh-from-client-by-server",
    "209": "one-way-from-server-by-server",
    "210": "refresh-from-server-by-server",
    //misc:
    "221": "result-alert", //requests sync results
    "222": "next-message", //requests next message
    "223": "no-end-of-data", //end of data not received => message missing? Syntax error?
    "224": "suspend", //suspend sync session
    "225": "resume"  // resume sync session
  };

//some more or less static device infos.
var DeviceProperties = {
  man: "B2GSync",
  mod: "",
  oem: "B2G",
  fwv: "16.01.2014", //set firmware version to today.
  swv: "1.4", //set to full platform version.. that could help to work out vcard interpretation issues.
  hwv: "16.01.2014", //set hardware version to today, too.. doesn't really care.
  devID: "Geeksphone Keon", //fill that from the account!
  devType: "smartphone", //say smartphone here. Also the tablet is "similar to a phone".. ;)

    id: undefined, //needs id.

    maxMsgSize: 16 * 1024
  };

//Sync works this way:
// 1. send msg with credentials in header and alert for syncmode
// 2. receive response, which hopefully accepts creds and syncmode (as status elements) and also has an alert with syncmode and target/source.
// 3. Gather data, send own sync command with add/replace/delete commands.
// 4. Receive Status for that.
// 5. Reply with Alert 222 => Next msg. Maybe that is a speciality of egroupware... As I see it the command could also be in the status msg...
// 6. Receive a sync command and parse the contents of the sync command, which should be add/replace/delete commands
// 7. Fulfill the commands, send a status element (with correct CmdRef!) for each command. => 200 = ok.
// 8. For all Add commands build a map with mapitems where target is id on server and source is new id on device.
// 9. Send this message.

//function passing: sync => sendSyncInitializationMsg => parseInitResponse => getSyncData => (external methods to get data) =>
//    continueSyncCalendar/Contacts => parseSyncResponse => itemActionCalendar/ContactsCallback => parseLastResponse => callback :)
// one problem remains: make contacts/calendar nicer and more uniform.. :( make it much easier to add more datastores.

var MimeTypes = {
    contacts: { pref: "text/x-vcard",  fallback: "text/x-vcard"}
};

var SyncML = (function () {      //lastMsg allways is the last response from the server, nextMsg allways is the message that we are currently building to send.
  var sessionInfo, account = {}, lastMsg, nextMsg, dsIndex = 0,
  //callbacks to get event / contacts data as iCal / vCard strings.
  //will all receive a callback function as parameter, that is to be called with "false" in the case of errors.
  //otherwise it needs to be supplied to the called sync function!
  //data needs to be of form { data = whole data in vcard/ iCal string, localId = id on device }
    //callback names:
      //needs to get all calendar data and call callback with { replace: [ all data here ] }, callback
      //getAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.getAllData callback to something."}); },
      //needs to get only new calendar data and call callback with { replace: [modified], add: [new], del: [deleted] }, callback
      //getNewData: function () { throw ({name: "LogicError", message: "Need to set calendar.getNewData callback to something."}); },
      //this will be called on refresh from server to delete all local data. Call callback with {}.
      //deleteAllData: function () { throw ({name: "LogicError", message: "Need to set calendar.deleteAllData callback to something."}); },
      //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
      //newEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.newEntry callback to something."}); },
      //Param: {type: replace, callback, localId: ..., item: new data }. Call callback with { type: replace, globalId: ..., localId: ... success: true/false }.
      //updateEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.updateEntry callback to something."}); },
      //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }.
      //delEntry: function () { throw ({name: "LogicError", message: "Need to set calendar.delEntry callback to something."}); },
      //status variables:
    dsNames = ["contacts"], dsTypes = [MimeTypes.contacts.pref],
    types = ["add", "del", "replace"], willBeSynced = [],
    secondTry = false,
    resultCallback, parseSyncResponse,
    msgQueue = []; //for multiple sync messages. Don't run into last-msg-cycle if there are messages in here.

  //private members & methods:
  sessionInfo = {
    sessionId: new Date().getTime(),
    msgId: 0,
    error: null,
    url: ''
  };

  //returns a msgId for a new message:
  function getMsgId() {
    sessionInfo.msgId += 1;
    return sessionInfo.msgId;
  }

  function ajaxCallPost(url, msg, headers) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open("POST", url);

      xhr.onload = function() {
        if (xhr.status === 200) {
          resolve(xhr);
        } else {
          reject(Error(xhr.statusText));
        }
      };

      xhr.onerror = function(e) {
        reject(Error("Network Error"));
      };

      xhr.setRequestHeader("Accept-Encoding", "identity");
      xhr.setRequestHeader("Content-Length", msg && msg.length);
      xhr.setRequestHeader("Accept", "*/*");
      xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      xhr.setRequestHeader("Date", new Date().toUTCString());
      for(var header in headers) {
        xhr.setRequestHeader(header, headers[header]);
      }
      xhr.send(msg);
    });
  }

  //sends a message to the server.
  function sendToServer(msg, callback, retry, id) {
    var text, retrySend, checkTimeout, received = false, lastSend, future, timeoutID;
    retrySend = function (e) {
      if (timeoutID) {
        console.log("Canceling timeout check for old message on retry send.");
        clearTimeout(timeoutID);
      }
      if (retry <= 5) {
        console.log("Got " + e.name + ": " + e.message + ". Retrying (" + retry + ")");
        console.log("Complete exception: " + JSON.stringify(e));
        sendToServer(msg, callback, retry + 1, id);
        lastSend = Date.now();
      } else {
        console.error({name: "ConnectionError", message: "No connection to server, even after retries."});
      }
    };
    checkTimeout = function() {
      var now;
      if (!received) {
        now = Date.now();
        console.log ("Message " + id + " was send last before " + ((now - lastSend) / 1000) + " seconds, was not yet received.");
        if (now - lastSend > 60*1000) { //last send before one minute?
          if (retry <= 5) {
            console.log("Trying to resend message.");
            retrySend({name:"Timeout", message:"Got no response in one minute."});
          } else {
            console.log("Already tried 5 times. Seems as if server won't answer? Sync seems broken.");
            clearTimeout(timeoutID);
            console.error({msg: "Message " + id + " timedout, even after retries. Sync failed."});
          }
        } else {
          timeoutID = setTimeout(checkTimeout, 1000);
        }
      } else {
        console.log ("Message " + id + " received, returning.");
      }
    };
    try {
      if (!retry) {
        retry = 0;
        id = getMsgId();
      }
      if (lastMsg) {
        msg.addStatuses(lastMsg);
      }
      text = msg.buildMessage({sessionId: sessionInfo.sessionId, msgId: id, target: account.url, source: DeviceProperties.id});
      console.log("Sending to server: " + text);
      nextMsg = msg; //just in case. :)
      future = ajaxCallPost(sessionInfo.url, text,
          {"Content-Type":"application/vnd.syncml+xml", "Content-Length": text.length});
      lastSend = Date.now();
      timeoutID = setTimeout(checkTimeout, 1000);
      future.then(function(response) {
        try {
          console.log("Status of message: " + response.status);
          console.log("Request succeeded, Got: ");
          console.log(response.responseText);
          if (response.responseText === "") {
            retrySend({name:"ConnectionError", message:"Got empty response, this indicates connection problem."});
          } else {
            received = true;
            clearTimeout(timeoutID); //did receive message => cancel timeouts.
            callback(response.responseText);
          }
        } catch (e) {
          //console.error(e); don't fail here, let retry mechanism work.
          retrySend(e);
        }
      }, function (error) {
        console.log("Error in SendMessage future: " + JSON.stringify(f.exeption));
      });
    } catch (error) {
      retrySend(error);
    }
  }

  function putDevInfo(msg, datastores, cmd) {
    msg.addPutDevInfo(DeviceProperties, datastores, cmd);
  }

  function generalParseMsg(text) {
    var i, j, k, failed, cmd, datastores, source, types, type, ds;
    try {
      lastMsg = syncMLMessage();
      /*i = 1;
      while (i < 300) {
        console.log("Char(" + i + "): " + text.charAt(i) + " = " + text.charCodeAt(i));
        i += 1;
      }
      return [ {cmd: {}, status: {}}];*/
      //console.log("trying to parse msg...");
      lastMsg.buildMessageFromResponse(text);
      //parse failed things here:
      failed = lastMsg.matchCommandsFromMessage(nextMsg);
      if (failed && failed.length > 0) { //debug output.
        console.log("Have " + failed.length + " failed commands: ");
        for (i = 0; i < failed.length; i += 1) {
          if ((failed[i].cmd.type === "Put" || failed[i].cmd.type === "Results") && failed[i].status.data === "501") {
            console.log("Server does not support put dev info, ignore.");
            failed.splice(i, 1);
            i -= 1;
          } else if (failed[i].status.cmdRef === "0") {
            console.log("Credentials not accepted by server. Can't sync! Please check credentials and try again.");
            resultCallback({success: false});
          } else {
            if (failed[i].status && failed[i].status.data === "406") {
              failed.splice(i, 1);
              i -= 1;
            } else {
              console.log(JSON.stringify(failed[i]));
            }
          }
        }
      }
      nextMsg = syncMLMessage();
      nextMsg.addCredentials(account);
      if (lastMsg.getHeader().respURI) {
        sessionInfo.url = lastMsg.getHeader().respURI;
        console.log("Got new response URI " + sessionInfo.url);
      }

      //if the map command got acknowledged, we can delete the old map...
      //console.log("got " + lastMsg.getBody().status.length + " stati in other msg.");
      try {
        for (i in lastMsg.getBody().status) {
          if (lastMsg.getBody().status.hasOwnProperty(i)) {
            for (j in lastMsg.getBody().status[i]) {
              if (lastMsg.getBody().status[i].hasOwnProperty(j)) {
                cmd = lastMsg.getBody().status[i][j];
                if (cmd.cmdName === "Map") {
                  console.log("Got map status");
                  if (cmd.data === "200") {
                    console.log("Map cmd was ok. DS: " + cmd.sourceRef);
                    ds = account.datastores[cmd.sourceRef];
                    if (ds) {
                      console.log("Deleting old mapping.");
                      delete ds.oldMapping;
                    }
                  } else {
                    console.log("Map command failed: " + cmd.data);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Other msg had no status? " + JSON.stringify(e));
      }

      //server may ask for device info, answer to that:
      for (i = 0; i < lastMsg.getBody().cmds.length; i += 1) {
        cmd = lastMsg.getBody().cmds[i];
        if (cmd.type === "Get" &&
            cmd.items &&
            cmd.items[0] &&
            cmd.items[0].target === "./devinf12") {
          console.log("Server requested dev info, put it into next msg.");
          cmd.msgId = lastMsg.getHeader().msgId;
          cmd.type = "Results";
          putDevInfo(nextMsg, undefined, cmd);
        //end of Get
        } else if ((cmd.type === "Results" || cmd.type === "Put") && cmd.items && cmd.items[0] && cmd.items[0].source === "./devinf12") {
          console.log("Got devInfo from server.");
          if (typeof cmd.items[0].data === "object") {
            datastores = cmd.items[0].data.getElementsByTagName("DataStore");
            for (j = 0; j < datastores.length; j += 1) {
              source = datastores.item(j).getElementsByTagName("SourceRef").item(0).firstChild.nodeValue;
              types = datastores.item(j).getElementsByTagName("CTType");
              console.log("Got " + types.length + " types from server for " + source + ".");
              for (k = 0; k < types.length; k += 1) {
                type = types.item(k).firstChild.nodeValue;
                console.log("Testing type " + type);
                if (type !== MimeTypes.contacts.pref) {
                  console.log("Skipping type " + type + ".");
                  type = undefined;
                } else {
                  break;
                }
              }
              if (type === undefined) {
                console.log("Preferred type not found, testing fallback.");
                for (k = 0; k < types.length; k += 1) {
                  type = types.item(k).firstChild.nodeValue;
                  console.log("Testing type " + type);
                  if (type !== MimeTypes.contacts.pref && type !== MimeTypes.contacts.fallback) {
                    console.log("Don't support type " + type + " right now. Please report back with console.log file.");
                    type = undefined;
                  } else {
                    break;
                  }
                }
              }
              console.log("Datastore: " + source);
              console.log("Type: " + type);
              for (k in account.datastores) {
                if (account.datastores.hasOwnProperty(k)) {
                  if (account.datastores[k].path === source) {
                    console.log("Setting type for datastore " + k);
                    account.datastores[k].serverType = type;
                    if (cmd.items[0].data.getElementsByTagName("DevID").item(0)) {
                      account.datastores[k].serverId = cmd.items[0].data.getElementsByTagName("DevID").item(0).firstChild.nodeValue;
                      console.log("Stored serverId: " + account.datastores[k].serverId);
                    }
                    if (cmd.items[0].data.getElementsByTagName("Man").item(0)) {
                        account.datastores[k].serverMan = cmd.items[0].data.getElementsByTagName("Man").item(0).firstChild.nodeValue;
                        console.log("Stored serverMan: " + account.datastores[k].serverMan);
                    }
                  } else {
                    console.log(k + " is not the right datastore");
                  }
                }
              } //account.datastores.loop
            } //datastores loop
          }
        } //end of results cmd.
      }
      return failed;
    } catch (e1) {
      console.log("Error in generalParseMsg:");
      console.log(JSON.stringify(e1));
    }
    return [];
  }

  function parseLastResponse(responseText, direct) {
    var failed, i;
    try {
      if (!direct) {
        failed = generalParseMsg(responseText);
        if (failed && failed.length > 0) {
          console.log("Have " + failed.length + " failed commands: ");
          for (i = 0; i < failed.length; i += 1) {
            console.log(JSON.stringify(failed[i]));
          }
          resultCallback({success: false});
          return;
        }
      }
      for (i = 0; i < willBeSynced.length; i += 1) {
        if (account.datastores[willBeSynced[i]]) {
          account.datastores[willBeSynced[i]].state = "finished";
					account.datastores[willBeSynced[i]].ok = true;
					console.log("Set " + willBeSynced[i] + " to sync ok " + account.datastores[willBeSynced[i]].ok);
        }
      }
      //sync finished successful! :)
      console.log("All ok. Finished sync, call last callback.");

			resultCallback({success: true, account: account }); //return account to update next / last sync. Mode might also be set by server. Nothing else should have changed.
    } catch (e) {
      console.error(e);
    }
  }

  function itemActionCallback(result) {
    var item, message, ds, cbsRunning, i;
    try {
      ds = account.datastores[result.name];
      if (result && result.success) {
        console.log("item action success");
        ds[result.type] -= 1;
        if (result.type === "add") {
          //get cmd item from last message to get the globalId for the mapping cmd.
          item = lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].items[result.globalId.item];
          if (result.localId) {
            ds.mapping.push({source: result.localId, target: item.source});
            item.status = 200;
            console.log("Added id to mapping");
          } else {
            console.log("No id for added item => failure");
            item.status = 510;
          }
        }
      } else if (result && result.success === false) {
        console.log("item action failure");
        ds[result.type] -= 1;
        //lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].status = 510; //remember that this was a failure. Fail the whole command if any item fails.
        lastMsg.getBody().sync[result.globalId.sync][result.type][result.globalId.cmd].items[result.globalId.item].status = 510;
        console.log("noted failure for status cmd.");
      }

      cbsRunning = 0;
      for (i = 0; i < willBeSynced.length; i += 1) {
        ds = account.datastores[willBeSynced[i]];
        cbsRunning += ds.add + ds.del + ds.replace;
      }
      console.log("Have " + cbsRunning + " callbacks left");
      if (cbsRunning === 0) { //all callbacks finished:
        console.log("all change callbacks finished.");
        if (msgQueue.length > 0) {
          message = msgQueue.shift(); //get first queued message.
        } else {
          message = nextMsg;
        }
        //add mappings to msg.
        for (i = 0; i < willBeSynced.length; i += 1) {
          ds = account.datastores[willBeSynced[i]];
          if (ds.oldMapping) {
            ds.mapping = ds.oldMapping.concat(ds.mapping);
          }
          message.addMap({source: ds.name, target: ds.path, mapItems: ds.mapping });
          if (ds.mapping.length === 0 && msgQueue.length === 0 && (!message.getBody().sync || message.getBody().sync.length === 0)) {
            console.log("message is empty => add alert 222"); //this might happen to often or even to few times... hm.
            message.addAlert({ data: "222", items: [ { source: ds.name, target: ds.path } ] });
            console.log("add alert ok");
          }
          ds.state = "sendMapping";
          ds.oldMapping = ds.mapping;
          ds.mapping = [];
        }

        console.log("lastMsg.isFinal = " + lastMsg.isFinal() + " msgQueue: " + msgQueue.length);
        if (lastMsg.isFinal() && msgQueue.length === 0) {
          //if (dsIndex < willBeSynced.length) {
          //  console.log("Sync of current datastore finished, sync next one");
          //  getSyncData();
          //} else {
            sendToServer(message, parseLastResponse);
          //}
        } else {
          console.log("Not final message. there will be more.");
					if (account.doImmediateRefresh && msgQueue.length === 0) {
						resultCallback({success: true, account: account }); //return account to update next / last sync. Mode might also be set by server. Nothing else should have changed.
					} else {
						sendToServer(message, parseSyncResponse); //continue sync.
					}
        }
      } else {
				console.log("Not finished, yet");
			}
    } catch (e) {
      console.error(e);
    }
  }

  //will need to see if any updates failed.
  //then the message will have changes from the server, that need to be processed.
  //in the end a new message containing mapings from local to global ids for new items
  //needs to be generated and send.
  //remark: we don't check item type anywhere.. this would be the right place.
  parseSyncResponse = function (responseText) {
    var lastOwn, failed, i, j, k, sync, callbacks = ["newEntry", "delEntry", "updateEntry"], ti, item, cmd, realFailure, ds, waitingSync, cmdName;
    try {
      lastOwn = nextMsg;
      failed = generalParseMsg(responseText);
      if (failed && failed.length > 0) {
        console.log("Have " + failed.length + " failed commands: ");
        realFailure = false;
        for (i = 0; i < failed.length; i += 1) {
          if (failed[i].status.data === "207") {
            console.log("Conflict resolved on server side with merge, replace command will follow. Own cmd was: " + JSON.stringify(failed[i].cmd));
          } else if (failed[i].status.data === "209") {
            console.log("Conflict resolved on server side with duplicate, add command will follow. Own cmd was: " + JSON.stringify(failed[i].cmd));
          } else if (failed[i].status.data === "419") {
            console.log("Conflict resolved on server side with server data. Own cmd and status: " + JSON.stringify(failed[i]));
          } else {
            cmdName = failed[i].status.cmd;
            if (!cmdName) {
              cmdName = failed[i].status.cmdName;
            }
            if (cmdName === "Replace" || cmdName === "Add" || cmdName === "Delete") {
              console.log("failed: " + JSON.stringify(failed[i]));
            } else {
              realFailure = true;
              console.log("failed: " + JSON.stringify(failed[i]));
            }
          }
        }
        if (realFailure) {
          resultCallback({success: false});
          return;
        }
      }
      console.log("Status-Cmds processed. No failures.");
      if (lastOwn.isFinal() && msgQueue.length === 0 &&                       //only if our last msg was out and we answered to all status replies try to get more from server.
          (!lastMsg.getBody().sync || lastMsg.getBody().sync.length === 0)) {     //if we are meant to get something from server! :)
        console.log("Did not receive a sync cmd.");
        for (i = 0; i < willBeSynced.length; i += 1) {
          if (account.datastores[willBeSynced[i]] &&
              account.datastores[willBeSynced[i]].actual_method !== "one-way-from-client" &&
              account.datastores[willBeSynced[i]].actual_method !== "refresh-from-client") {
            account.datastores[willBeSynced[i]].state = "waitingSyncCmd";
            waitingSync = true;
          }
        }
        if (waitingSync) {
          if (!secondTry) {
            secondTry = true;
            console.log("Try to get next msg command.");
            for (i = 0; i < willBeSynced.length; i += 1) {
              if (account.datastores[willBeSynced[i]]) {
                nextMsg.addAlert({ data: "222", items: [ { source: willBeSynced[i], target: account.datastores[willBeSynced[i]].path } ] });
              }
            }
            sendToServer(nextMsg, parseSyncResponse);
            return;
          } else {
            console.log("Already had second try, something failed.");
            resultCallback({success: false});
            return;
          }
        } else {
          //if (dsIndex < willBeSynced.length) {
          //  console.log("Start sync of next datastore.");
         //   getSyncData();
         // } else {
            console.log("All sync cmds finished. => sync finished.");
            parseLastResponse("", true);
          //}
          return;
        }
      }
      secondTry = false;

      if (!account.doImmediateRefresh) { //don't to adds and stuff. Will do a refresh anyway, soon.
        //server will answer with sync-command(s) that contains server changes:
        for (i = 0; lastMsg.getBody().sync && i < lastMsg.getBody().sync.length; i += 1) {
          console.log("Processing sync " + (i + 1) + " of " + lastMsg.getBody().sync.length + " syncs.");
          sync = lastMsg.getBody().sync[i];
          ds = account.datastores[sync.target];

          for (ti = 0; ti < types.length; ti += 1) {
            for (j = 0; sync[types[ti]] && j < sync[types[ti]].length; j += 1) {
              cmd = sync[types[ti]][j];
              for (k = 0; k < cmd.items.length; k += 1) {
                ds[types[ti]] += 1;
                item = undefined;
                if (types[ti] !== "del") {
                    item = cmd.items[k].data;
                    if (cmd.items[k].format === "b64") {
                        item = Base64.decode(item); //CDATA needs to be removed in SyncMLMessage.
                    }
                }
                setTimeout(ds[callbacks[ti]].bind(this, {
                  type: types[ti],
                  callback: itemActionCallback,
                  localId: cmd.items[k].target,
                  globalId: {sync: i, item: k, cmd: j, cmdId: cmd.cmdId }, //abuse cmdId to get globalId later and find status better later. :)
                  item: item,
                  name: ds.name,
                  serverData: ds,
                  account: account
                }), 100);
              }
            }
          }
          ds.state = "processingData";
        } //sync cmd processing.
      }
      console.log("Parsing of sync response finished.");
      itemActionCallback({}); //in case there was no action to be done, continue with sync by calling itemActionCallback.
    } catch (e) {
      console.error(e);
    }
  };

  function mContinueSync(name, data) {
    var addedItems = 0, allItemsForThisDS = 0, ti = 0, i, obj, type;

    try {
      if (!data.success) {
        resultCallback({success: false});
        return;
      }
      for (ti = 0; ti < types.length; ti += 1) {
        for (i = 0; data[types[ti]] && i < data[types[ti]].length; i += 1) {
          obj = data[types[ti]][i];
          type = types[ti];
          if (account.datastores[name].actual_method === "slow" && type === "replace") { //make sure that we send only adds on slow sync.
            type = "add";
          }
          nextMsg.addSyncCmd({
            type: type,
            item: {
              data:  obj.data ? "<![CDATA[" + Base64.encode(obj.data) + "]]>" : undefined,
              source: obj.localId,
              //target: obj.uid,
              meta: {
                type: account.datastores[name].serverType ? account.datastores[name].serverType : account.datastores[name].type,
                format: "b64" //do we want b64? First try without, maybe.. easier to debug.
              }
            }
          });
          account.datastores[name][types[ti] + "Own"] += 1;
          addedItems += 1;
          allItemsForThisDS += 1;
          if (addedItems >= 9) { //TODO: make this more dynamic as reaction to server.
            addedItems = 0;
            //tell server that this won't be the last msg.
            nextMsg.setFinal(false);
            //we need to send sync command to initialize sync, even if we don't have data.
            //initialize target / source for sync cmd.
            nextMsg.setSyncTargetSource({ source: name, target: account.datastores[name].path });
            msgQueue.push(nextMsg);
            nextMsg = syncMLMessage(); //get new message!
            nextMsg.addCredentials(account);
          }
        }
        delete data[types[ti]]; //try to free some memory.
      }

      if (dsIndex >= willBeSynced.length) {
        if (addedItems === 0 && msgQueue.length > 0 && allItemsForThisDS !== 0) { //last msg was empty. get back the last msg of the queue if there is one. Only if this DS did add any items.
          nextMsg = msgQueue.pop();
        }

        //store last msg in queue.
        nextMsg.setFinal(true);

        //we need to send sync command to initialize sync, even if we don't have data.
        //initialize target / source for sync cmd.
        nextMsg.setSyncTargetSource({ source: name, target: account.datastores[name].path });
        msgQueue.push(nextMsg);
        nextMsg = msgQueue.shift(); //get FIRST message from queue.
        sendToServer(nextMsg, parseSyncResponse);
        account.datastores[name].state = "waitingForSyncResponse";
      } else {
        //we need to send sync command to initialize sync, even if we don't have data.
        //initialize target / source for sync cmd.
        nextMsg.setSyncTargetSource({ source: name, target: account.datastores[name].path });
        msgQueue.push(nextMsg);

        nextMsg = syncMLMessage(); //get new message!
        nextMsg.addCredentials(account);

        console.log("Waiting for data from next Datastore.");
        getSyncData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  //this will try to get all changes from the device.
  function getSyncData() {
    var i, method;
    try {
      i = dsIndex;
      console.log("Getting data for " + willBeSynced[dsIndex]);
      dsIndex += 1;
      if (i < willBeSynced.length) {
        if (account.datastores[willBeSynced[i]]) {
          method = account.datastores[willBeSynced[i]].actual_method;
          if (method === "slow" || method === "refresh-from-client") {
            console.log("Getting all data, because of slow sync or refresh from client.");
            account.datastores[willBeSynced[i]].getAllData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "gatheringAllData";
          } else if (method === "two-way" || method === "one-way-from-client") {
            console.log("Getting new data, because of two-way sync or one way from client.");
            account.datastores[willBeSynced[i]].getNewData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "gatheringNewData";
          } else if (method === "refresh-from-server") {
            console.log("Deleting all data, because of refresh from server.");
            account.datastores[willBeSynced[i]].deleteAllData({callback: mContinueSync.bind(null, willBeSynced[i]), serverData: account.datastores[willBeSynced[i]], account: account});
            account.datastores[willBeSynced[i]].state = "deletingAllData";
          } else if (method === "one-way-from-server") {
            console.log("Don't get any calendar data, because of one way from server sync.");
            account.datastores[willBeSynced[i]].state = "receivingData";
            mContinueSync(willBeSynced[i], {success: true});
          } else {
            console.log("Unknown sync method: " + method);
            resultCallback({success: false});
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  function parseInitResponse(responseText) {
    var failed, numProblems = 0, i, alert, needRefresh = false, syncAndMethod = [];
    try {
      failed = generalParseMsg(responseText);
      if (failed && failed.length > 0) {
        numProblems = failed.length;
        console.log("Have " + failed.length + " failed commands: ");
        for (i = 0; i < failed.length; i += 1) {
          console.log(JSON.stringify(failed[i]));
          if (failed[i].status.cmdName === "Alert" && failed[i].status.data === "508") { //server requires refresh.
            console.log("No problem, server just wants a refresh.");
            needRefresh = true;
            numProblems -= 1;
          } else {
            console.log("Cmd " + failed[i].status.cmd + " failed. Code: " + failed[i].status.data);
          }
        }
      }
      if (numProblems) {
        console.log(numProblems + " real problems left... break.");
        resultCallback({success: false});
        return;
      } else {
        //server will answer with sync-alerts, which might have a different sync mode, like slow for first sync:
        //TODO: maybe some other server will already send a sync cmd with data here?? See if that happens...
        willBeSynced = []; //empty willBeSynced.
        for (i = 0; i < lastMsg.getBody().alerts.length; i += 1) {
          alert = lastMsg.getBody().alerts[i];
          //console.log("Alert: " + JSON.stringify(alert));
          if (alert.items && alert.items[0]) {
            if (account.datastores[alert.items[0].target]) {
              if (alert.data) {
                console.log("Got " + alert.items[0].target + " method: " + alert.data);

                //server requested slow sync, ignore and just send own updates.. do this only for two-way and one-way-from server, obviously :)
                console.log("Alert.data: " + alert.data + " and account->method: " + account.datastores[alert.items[0].target].method);
                if (account.slowSyncDisabled &&
                    alert.data === "201" &&
                        (account.datastores[alert.items[0].target].method === "two-way" ||
                          account.datastores[alert.items[0].target].method === "one-way-from-server")) {
                    console.log ("Delaying refresh.");
                    account.doImmediateRefresh = true;
                    needRefresh = false;
                    account.datastores[alert.items[0].target].actual_method = account.datastores[alert.items[0].target].method;
                } else {
                    //don't switch to slow for refresh from server syncs.
                    if (account.datastores[alert.items[0].target].method === "refresh-from-server" && alert.data === "201") {
                        console.log("Requested refresh from server, won't switch to slow sync.");
                    } else {
                        //just use server method.
                        account.datastores[alert.items[0].target].actual_method = SyncMLAlertCodes[alert.data];
                    }
                }
                console.log("adding " + alert.items[0].target + " to will be synced.");
                willBeSynced.push(alert.items[0].target);
                syncAndMethod.push(alert.items[0].target + " method " + account.datastores[alert.items[0].target].actual_method);
                account.datastores[alert.items[0].target].state = "receivedInit";
                console.log("willbesynced: " + alert.items[0].target + " method " + account.datastores[alert.items[0].target].actual_method);
              }
              if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.last) {
                account.datastores[alert.items[0].target].serverLast = account.datastores[alert.items[0].target].serverNext;
                console.log("Got server-last: " + alert.items[0].meta.anchor.last + " and have own server-last: " + account.datastores[alert.items[0].target].serverLast);
                if (account.datastores[alert.items[0].target].serverLast !== alert.items[0].meta.anchor.last) {
                  console.log("Lasts do not match. Hopefully server told us to do slow sync.");
                }
              }
              if (alert.items && alert.items[0] && alert.items[0].meta && alert.items[0].meta.anchor && alert.items[0].meta.anchor.next) {
                console.log("Got next: " + alert.items[0].meta.anchor.next + " for server, save.");
                account.datastores[alert.items[0].target].serverNext = alert.items[0].meta.anchor.next;
                OSync.saveConfig(account); //directly store serverNext!!
              }
            }
          }
        }
        if (needRefresh) {
          console.log("Server told us that we need to refresh, but did not send a alert for that... fail. :(");
          //resultCallback({success: false});
          //return;
        }
        console.log("Will sync " + JSON.stringify(syncAndMethod));
        getSyncData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function parseCredResponse(responseText) {
    var responseMsg, status;

    try {
      responseMsg = syncMLMessage();
      responseMsg.buildMessageFromResponse(responseText);
      status = responseMsg.getBody().status[sessionInfo.msgId]["0"].data; //status of last msg and header => allways 0.
      if (status === "212" || status === "200") {
        console.log("Good credentials.");
        resultCallback({success: true});
      } else {
        console.log("Wrong credentials?, status data: " + status);
        resultCallback({success: false});
      }
    } catch (e) {
      console.error(e);
    }
  }

  //define public interface:
	return {
	  initialize: function (inAccount) {
	    var i, ds;
	    try {
	      if (inAccount.deviceName) {
	        DeviceProperties.mod = inAccount.deviceName;
	        console.log("Got deviceName: " + DeviceProperties.mod);
	      }

        sessionInfo.sessionId = parseInt((new Date().getTime() / 1000).toFixed(), 10);
        sessionInfo.msgId = 0;
        sessionInfo.error = null;
        sessionInfo.url = inAccount.url; //initialize with global url, might change later.
        dsIndex = 0;
        account = inAccount;
        if (account.datastores === undefined) {
          account.datastores = [];
        }
        for (i = 0; i < dsNames.length; i += 1) {
          ds = account.datastores[dsNames[i]];
          if (ds) {
            ds.name = dsNames[i];
            ds.type = dsTypes[i];
            ds.add = 0;
            ds.del = 0;
            ds.replace = 0;
            ds.addOwn = 0;
            ds.replaceOwn = 0;
            ds.delOwn = 0;
            ds.mapping = [];
            ds.state = "sendingInit";
            ds.ok = false;
          }
        }
        secondTry = false;

        if (!DeviceProperties.devID) {
          throw ({name: "MissingInformation", message: "Error: Need to fill DeviceProperties.devId before syncML can start."});
        } else {
          DeviceProperties.id = DeviceProperties.devID;
          //console.log("Will be known to server as " + DeviceProperties.id);
        }
	    } catch (e) {
	      console.error(e);
	    }
	  },

	  //finished 5.10.2011, is working with eGroupware, both ok and false.
		//callback will be called with true or false as argument.
		checkCredentials: function (callback) {
		  try {
		    nextMsg = syncMLMessage(); //TODO: ist das richtig so??? :(
		    nextMsg.addCredentials(account); //cool, will find username and password field. :)
		    nextMsg.setFinal(true);
		    resultCallback = callback;

      nextMsg.addAlert({
            data: "200",
            items: [{
              target: "configuration",
              source: "configuration",
              meta: { anchor: { next: (new Date().getTime() / 1000).toFixed() }}
            }]
          });

		    sendToServer(nextMsg, parseCredResponse);
		  } catch (e) {
	      console.error(e);
	    }
		},

		sendSyncInitializationMsg: function (callback) {
		  var i, ds, datastores = [], doPutDevInfo = false, method;
		  try {
		    nextMsg = syncMLMessage();
		    nextMsg.addCredentials(account);
		    nextMsg.setFinal(true);
				if (callback) {
					resultCallback = callback;
				}

		    for (i = 0; i < dsNames.length; i += 1) {
              ds = account.datastores[dsNames[i]];
              ds.last = ds.next;
              ds.next = (new Date().getTime() / 1000).toFixed();
              method = SyncMLModes["slow"];
              if (account.doImmediateRefresh) { //did a corrupted slow sync and now need to do a complete refresh!
                  method = "205";
                  console.log("Am required to do a refresh. Overwrite method with: " + method);
              }
              nextMsg.addAlert({
                data: method,
                items: [{
                  target: ds.path,
                  source: dsNames[i],
                  meta: { anchor: { next: ds.next, last: ds.last }}
                }]
              });
              datastores.push({name: ds.name, type: ds.type});

              if (!ds.serverType || !ds.serverId || !ds.serverMan || ds.method === "slow" || ds.method === "refresh-from-client" || ds.method === "refresh-from-server") {
                doPutDevInfo = true;
                ds.lastRev = 0; //reset last rev on refresh.
                nextMsg.doGetDevInfo();
              }
		    }
        if (doPutDevInfo) { //devInfo will be send, if we don't know anything about the server
                          //or if we need to do slow sync, or refresh from client/server.
          putDevInfo(nextMsg, datastores, {type: "Put"});
        }

        console.log("Sending initialization message to server.");
        sendToServer(nextMsg, parseInitResponse);
            account.doImmediateRefresh = false;
		  } catch (e) {
	      console.error(e);
	    }
		},

		//callbacks of type: [ name: "calendar", ...]
		setCallbacks: function (callbacks) {
		  var i, ds;
		  console.log("Got contacts callbacks.");
		  for (i = 0; i < callbacks.length; i += 1) {
		    ds = account.datastores[callbacks[i].name];
		    if (ds) {
		      ds.getAllData = callbacks[i].getAllData;
		      ds.getNewData = callbacks[i].getNewData;
		      ds.deleteAllData = callbacks[i].deleteAllData;
		      ds.newEntry = callbacks[i].newEntry;
		      ds.updateEntry = callbacks[i].updateEntry;
		      ds.delEntry = callbacks[i].delEntry;
		    }
		  }
		},

		continueSync: mContinueSync
	};
}());
