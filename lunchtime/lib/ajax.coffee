q = require("q")
$ = require("jquery")

#test_data = require("../../test_data/2014-w12-fornebu.json")

class Ajax
  constructor: (backend) ->
    if backend
      @backend = backend
    else
      @backend = $.ajax
  getJson: (url) ->
    deferred = q.defer()
    #deferred.resolve test_data
    @real(url, deferred)
    deferred.promise
  real: (url, deferred) ->
    @backend {
      url: url,
      dataType: 'json'
      headers: "Access-Control-Request-Method: GET"
      success: (data) -> deferred.resolve data
      error: (e) -> deferred.reject e
    }

module.exports = Ajax
