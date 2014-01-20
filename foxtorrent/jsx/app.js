/** @jsx React.DOM */
var DownloadLink = React.createClass({
    render: function() {
        return <a href="#" onClick={this.onClick}><h1>Download!</h1></a>;
    },
    onClick: function(event) {
        var mockUrl = 'http://panda.cd/index.php?p=torrents&action=download&id=1401';
        DownloadManager.downloadTorrent(mockUrl);
    }
});

React.renderComponent(<DownloadLink />, document.getElementById('dummy-link'));
