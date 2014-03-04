var LunchTime, React, _;

_ = require("underscore");

React = require("react");

LunchTime = React.createClass({
  render: (<div>Hey, world! Whazzup?!
    </div>)
});

React.renderComponent(<LunchTime />, document.getElementById('lunchtimeRoot'));
