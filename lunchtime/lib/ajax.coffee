q = require("q")
$ = require("jquery")

test_data = require("../../test_data/2014-w11-fornebu.json")

class Ajax
  constructor: (backend) ->
    if backend
      @backend = backend
    else
      @backend = $.ajax
  getJson: (url) ->
    deferred = q.defer()

    deferred.resolve test_data
    #real(url, deferred)

    deferred.promise
  real: (url, deferred) ->
    console.log "asdfw"
    @backend {
      url: url,
      dataType: 'json'
      headers: "Access-Control-Request-Method: GET"
      success: (data) -> deferred.resolve data
      error: (e) -> deferred.reject e
    }


module.exports = Ajax
