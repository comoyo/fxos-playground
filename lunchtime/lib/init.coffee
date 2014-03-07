class Init
  constructor: ->
  registerPageVisibility: (callback) ->
    document.addEventListener "visibilitychange", -> callback() unless document.hidden

module.exports = Init
