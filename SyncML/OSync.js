"use strict";

var OSync = (function(){
  return {
    getDeviceContacts: function() {
      var contactCount = navigator.mozContacts.getCount();

      contactCount.onsuccess = function () {
        console.log("result: " + this.result);
      };

      contactCount.onerror = function () {
        console.error("error: " + this.error.name);
      };
    },

    initializeFramework: function() {
      var syncCallback = function(result) {
        try {
          console.log("Sync came back.");
          if (result.success === true) {
            console.log("Sync was succesful");
          } else {
            console.log("Sync failed");
          }
        } catch (e) {
          console.log(e);
        }
      };
      try {
        console.log("Finishing initialization of SyncML framework.");
        var account = this.loadConfig();
        if (!account) {
          account = Account;
          this.saveConfig();
        }
        SyncML.initialize(account);
        SyncML.setCallbacks([
          {
            name: "contacts",
            //needs to get all calendar data and call callback with { update: [ all data here ] }, callback
            getAllData: contactCallbacks.getAllContacts,
            //needs to get only new calendar data and call callback with { update: [modified], add: [new], del: [deleted] }, callback
            getNewData: contactCallbacks.getNewContacts,
            //this will be called on refresh from server to delete all local data. Call callback with {}.
            deleteAllData: contactCallbacks.deleteAllContacts,
            //Param: {type: add, callback, globalId: ..., item: new item data }. call callback with {type: add, globalId: ..., localId: ... success: true/false }
            newEntry: contactCallbacks.createContact,
            //Param: {type: update, callback, localId: ..., item: new data }. Call callback with { type: update, globalId: ..., localId: ... success: true/false }.
            updateEntry: contactCallbacks.updateContact,
            //Param: { type: del, callback, localId: ... }. Call callback with { type: del, globalId: ..., localId: ... success: true/false }.
            delEntry: contactCallbacks.deleteContact
          }
        ]);
        console.log("SyncML initialized.");
        SyncML.sendSyncInitializationMsg(syncCallback);
      } catch (e) {
        console.log(e);
      }
    },

    loadConfig: function() {
      var localStorage = window.localStorage;
      var retrievedObject = localStorage.getItem('account');
      if (!retrievedObject) {
        return false;
      } else {
        return JSON.parse(retrievedObject);
      }
    },

    saveConfig: function(account) {
      var localStorage = window.localStorage;
      localStorage.setItem('account', JSON.stringify(account));
    }
  };
}());

//OSync.initializeFramework();
