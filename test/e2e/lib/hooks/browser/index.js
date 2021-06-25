/**
 * Internal dependencies
 */
import { saveBrowserLogs } from './browser-logs';
import { createBrowser, closeBrowser } from './browser';

export const buildHooks = () => {
	let driver;

	return {
		createBrowser: async function ( options ) {
			driver = await createBrowser( options );
			return driver;
		},
		saveBrowserLogs: function ( options ) {
			if ( driver ) return saveBrowserLogs( { ...options, driver } );
		},
		closeBrowser: function () {
			if ( driver ) return closeBrowser( { driver } );
		},
	};
};
