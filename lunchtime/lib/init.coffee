class Init
  constructor: ->
  registerPageVisibility: (callback) ->
    document.addEventListener "visibilitychange", -> callback() unless document.hidden
  getLanguage: (input) ->
    return "no" if input in ["nb", "nn", "no", "nb-NO", "nn-NO", "nb_NO", "nn_NO"]
    return "en"


module.exports = Init
