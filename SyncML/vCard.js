//JSLint stuff:
/*global Contacts, fs, console.log, Future, path, MimeTypes, quoted_printable_decode, quoted_printable_encode, quote, Base64 */

var vCard = (function () {
  photoPath = "/media/internal/.syncml_photos/",
  vCardIndex = 0;

  function cleanUpEmptyFields(obj) {
    var field;
    if (typeof obj === "object") {
      for (field in obj) {
        if (typeof obj[field] === "string") {
          if (obj[field] === "") {
            delete obj[field];
          }
        } else if (typeof obj[field] === "object") {
          cleanUpEmptyFields(obj[field]);
        }
      }
    }
  }

  function parse (input) {
  }

  //public interface:
  return {
    initialize: function (outerFuture) {
      var photo = false, tmp = false, finished = function () {
        if (tmp && photo) {
          var res = outerFuture.result;
          if (!res) {
            res = {};
          }
          res.vCard = true;
          outerFuture.result = res;
        }
      };

      //check that a temporary file path exists to save/read vcards to.
      path.exists(tmpPath, function(exists)  {
        if (!exists) {
          fs.mkdir(tmpPath, 0777, function (error) {
            if (error) {
              console.log("Could not create tmp-path, error: " + JSON.stringify(error));
            }
            tmp = true;
            finished();
          });
        } else {
          tmp = true;
          finished();
        }
      });

      //create path for photos:
      path.exists(photoPath, function (exists) {
        if(!exists) {
          fs.mkdir(photoPath, 0777, function (error) {
            if (error) {
              console.log("Could not create photo-path, error: " + JSON.stringify(error));
            }
            photo = true;
            finished();
          });
        } else {
          photo = true;
          finished();
        }
      });
    },

    //parameters:
    //vcard = text representation of vcard
    //account = full account object.
    //serverData = configuration data of the server..
    parseVCard: function (input) {
      console.log("Parse input: " + input);
      return new Promise(function(resolve, reject) {
        parse(input.vCard);
        resolve(input);
      });
    },

    //input:
    //contactId
    generateVCard: function (input) {
      console.log("Generate input: " + input);
      return new Promise(function(resolve, reject) {
        resolve(input);
      });
    },

    cleanUp: function (account) {
      return true;
    }
    }; //end of public interface
  }());
