var React = require( 'react' );

var EmptyContent = require( 'components/empty-content' ),
	ExternalLink = require( 'components/external-link' ),
	stats = require( 'reader/stats' );

var FeedEmptyContent = React.createClass( {
	shouldComponentUpdate: function() {
		return false;
	},

	recordAction: function() {
		stats.recordAction( 'clicked_freshly_pressed_on_empty' );
		stats.recordGaEvent( 'Clicked Freshly Pressed on EmptyContent' );
	},

	recordSecondaryAction: function() {
		stats.recordAction( 'clicked_recommendations_on_empty' );
		stats.recordGaEvent( 'Clicked Recommendations on EmptyContent' );
	},

	render: function() {
		var action = (
			<ExternalLink
				className="empty-content__action button is-primary"
				onClick={ this.recordAction }
				href="https://wordpress.com/fresh/">{ this.translate( 'Explore our Editors\' Picks' ) }</ExternalLink> ),
			secondaryAction = (
				<ExternalLink
					className="empty-content__action button"
					onClick={ this.recordSecondaryAction }
					href="https://wordpress.com/recommendations/">{ this.translate( 'Get recommendations on who to follow' ) }</ExternalLink> );

		return ( <EmptyContent
			title={ this.translate( 'No recent posts…' ) }
			line={ this.translate( 'This site has not posted anything recently.' ) }
			action={ action }
			secondaryAction={ secondaryAction }
			illustration={ '/calypso/images/drake/drake-empty-results.svg' }
			illustrationWidth={ 500 }
			/> );
	}
} );

module.exports = FeedEmptyContent;
