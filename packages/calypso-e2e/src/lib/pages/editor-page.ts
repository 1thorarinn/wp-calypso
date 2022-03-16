import { Page, Frame, ElementHandle, Response, FrameLocator } from 'playwright';
import { getCalypsoURL } from '../../data-helper';
import { reloadAndRetry } from '../../element-helper';
import envVariables from '../../env-variables';
import {
	EditorPublishPanelComponent,
	EditorNavSidebarComponent,
	EditorToolbarComponent,
	EditorSettingsSidebarComponent,
	EditorGutenbergComponent,
	NavbarComponent,
} from '../components';
import type { PreviewOptions, EditorSidebarTab, PrivacyOptions, Schedule } from '../components';

const selectors = {
	// iframe and editor
	editorFrame: '.calypsoify.is-iframe iframe.is-loaded',
	editorTitle: '.editor-post-title__input',

	// Within the editor body.
	blockWarning: '.block-editor-warning',

	// Toast
	toastViewPostLink: '.components-snackbar__content a:text-matches("View (Post|Page)", "i")',

	// Welcome tour
	welcomeTourCloseButton: 'button[aria-label="Close Tour"]',
};

/**
 * Represents an instance of the WPCOM's Gutenberg editor page.
 */
export class EditorPage {
	private page: Page;
	private requiresGutenframe: boolean;
	private frameLocator: FrameLocator;
	private editorPublishPanelComponent: EditorPublishPanelComponent;
	private editorNavSidebarComponent: EditorNavSidebarComponent;
	private editorToolbarComponent: EditorToolbarComponent;
	private editorSettingsSidebarComponent: EditorSettingsSidebarComponent;
	private editorGutenbergComponent: EditorGutenbergComponent;

	/**
	 * Constructs an instance of the component.
	 *
	 * @param {Page} page The underlying page.
	 * @param {Object} [options] options
	 * @param {boolean} [options.requiresGutenframe=false] indicates that staying
	 * on the Gutenframe is strictly required and if the editor is loaded from a WPAdmin
	 * route or is booted to it, then an error will be thrown and the test will fail
	 * because the iframe will not be found on the page. Defaults to `false`, which means
	 * it will try to get the top frame if on WPadmin (non-wordpress.com URL) or if it
	 * can't get hold of the Gutenframe (i.e it redirected because of an error). This
	 * should allow the test to finally get hold of the editor even if the Gutenframe
	 * can't be found.
	 */
	constructor(
		page: Page,
		options: { requiresGutenframe: boolean } = {
			requiresGutenframe: false,
		}
	) {
		const { requiresGutenframe } = options;

		this.page = page;
		this.requiresGutenframe = requiresGutenframe;
		this.frameLocator = page.frameLocator( selectors.editorFrame );
		this.editorPublishPanelComponent = new EditorPublishPanelComponent(
			page,
			page.frameLocator( selectors.editorFrame )
		);
		this.editorNavSidebarComponent = new EditorNavSidebarComponent(
			page,
			page.frameLocator( selectors.editorFrame )
		);
		this.editorToolbarComponent = new EditorToolbarComponent(
			page,
			page.frameLocator( selectors.editorFrame )
		);
		this.editorSettingsSidebarComponent = new EditorSettingsSidebarComponent(
			page,
			page.frameLocator( selectors.editorFrame )
		);
		this.editorGutenbergComponent = new EditorGutenbergComponent(
			page,
			page.frameLocator( selectors.editorFrame )
		);
	}

	/* Generic methods */

	/**
	 * Opens the "new post/page" page. By default it will open the "new post" page.
	 *
	 * Example "new post": {@link https://wordpress.com/post}
	 * Example "new page": {@link https://wordpress.com/page}
	 */
	async visit( type: 'post' | 'page' = 'post' ): Promise< Response | null > {
		const request = await this.page.goto( getCalypsoURL( type ) );
		await this.waitUntilLoaded();

		return request;
	}

	/**
	 * Initialization steps to ensure the page is fully loaded.
	 *
	 * @returns {Promise<Frame>} iframe holding the editor.
	 */
	async waitUntilLoaded(): Promise< Frame > {
		const frame = await this.getEditorFrame();
		// Traditionally we try to avoid waits not related to the current flow.
		// However, we need a stable way to identify loading being done. NetworkIdle
		// takes too long here, so the most reliable alternative is the title being
		// visible.
		const titleLocator = this.frameLocator.locator( selectors.editorTitle );
		await titleLocator.waitFor();
		// Once https://github.com/Automattic/wp-calypso/issues/57660 is resolved,
		// the next line should be removed.
		await this.forceDismissWelcomeTour();

		return frame;
	}

	/**
	 * Forcefully dismisses the Welcome Tour via action dispatch.
	 *
	 * @see {@link https://github.com/Automattic/wp-calypso/issues/57660}
	 */
	async forceDismissWelcomeTour(): Promise< void > {
		const frame = await this.getEditorFrame();

		await frame.waitForFunction(
			async () =>
				await ( window as any ).wp.data
					.select( 'automattic/wpcom-welcome-guide' )
					.isWelcomeGuideStatusLoaded()
		);

		await frame.waitForFunction( async () => {
			const actionPayload = await ( window as any ).wp.data
				.dispatch( 'automattic/wpcom-welcome-guide' )
				.setShowWelcomeGuide( false );

			return actionPayload.show === false;
		} );
	}

	/**
	 * Return the editor frame. Could be the top-level frame (i.e WPAdmin).
	 * an iframe (Calypso/Gutenframe).
	 *
	 * @returns {Promise<Frame>} frame holding the editor.
	 */
	async getEditorFrame(): Promise< Frame > {
		if ( ! this.requiresGutenframe ) {
			// If we're not in the Gutenframe context (i.e not Calypso), then
			// just return the top frame, no need to try to locate the iframe.
			if ( this.page.url().includes( '/wp-admin' ) ) {
				return await this.page.mainFrame();
			}
		}

		const locator = this.page.locator( selectors.editorFrame );

		try {
			const elementHandle = await locator.elementHandle( {
				timeout: 105 * 1000,
			} );

			return ( await elementHandle!.contentFrame() ) as Frame;
		} catch {
			if ( this.requiresGutenframe ) {
				throw new Error( 'Could not locate editor iframe' );
			} else {
				// The CalipsoifyIframe component will redirect to the plain WPAdmin page if
				// there's an error or if the iframe takes too long to completely load. The
				// goal here is to ge hold of the editor and not test any aspects related to
				// the Gutenframe, so we return the `mainFrame` to allow the test to access
				// the editor in the WPAdmin page.
				console.info( 'Could not locate editor iframe. Returning the top-level frame instead' );
				return this.page.mainFrame();
			}
		}
	}

	/**
	 * Closes all panels that can be opened in the editor.
	 *
	 * This method will attempt to close the following panels:
	 * 	- Publish Panel (including pre-publish checklist)
	 * 	- Editor Settings Panel
	 * 	- Editor Navigation Sidebar
	 */
	async closeAllPanels(): Promise< void > {
		await Promise.allSettled( [
			this.editorPublishPanelComponent.closePanel(),
			this.editorNavSidebarComponent.closeSidebar(),
			this.editorToolbarComponent.closeSettings(),
		] );
	}

	/* Editor */

	/**
	 * Enters the text into the title block and verifies the result.
	 *
	 * @param {string} title Text to be used as the title.
	 * @throws {Error} If entered title does not match.
	 */
	async enterTitle( title: string ): Promise< void > {
		await this.editorGutenbergComponent.enterTitle( title );
		const enteredTitle = await this.editorGutenbergComponent.getTitle();

		const sanitizedTitle = title.trim();
		if ( enteredTitle !== sanitizedTitle ) {
			throw new Error(
				`Failed to verify title: got ${ enteredTitle }, expected ${ sanitizedTitle }`
			);
		}
	}

	/**
	 * Enters text into the body, splitting newlines into new pragraph blocks as necessary. The entered text is then read back and checked.
	 *
	 * @param {string} text Text to be entered into the paragraph blocks, separated by newline characters.
	 */
	async enterText( text: string ): Promise< void > {
		await this.editorGutenbergComponent.enterText( text );
		const enteredText = await this.editorGutenbergComponent.getText();

		if ( text !== enteredText ) {
			`Failed to verify entered text: got ${ enteredText }, expected ${ text }`;
		}
	}

	/**
	 * Returns the text found in the editor.
	 *
	 * @returns {Promise<string>} String representing text entered in each paragraph block.
	 */
	async getText(): Promise< string > {
		return await this.editorGutenbergComponent.getText();
	}

	/**
	 * Adds a Gutenberg block from the block inserter panel.
	 *
	 * The name is expected to be formatted in the same manner as it
	 * appears on the label when visible in the block inserter panel.
	 *
	 * Example:
	 * 		- Click to Tweet
	 * 		- Pay with Paypal
	 * 		- SyntaxHighlighter Code
	 *
	 * The block editor selector should select the top level element of a block in the editor.
	 * For reference, this element will almost always have the ".wp-block" class.
	 * We recommend using the aria-label for the selector, e.g. '[aria-label="Block: Quote"]'.
	 *
	 * @param {string} blockName Name of the block to be inserted.
	 */
	async addBlock( blockName: string, blockEditorSelector: string ): Promise< ElementHandle > {
		await this.editorGutenbergComponent.resetSelectedBlock();
		await this.editorToolbarComponent.openBlockInserter();
		await this.editorGutenbergComponent.searchBlockInserter( blockName );
		await this.editorGutenbergComponent.selectBlockInserterResult( blockName );

		const blockHandle = await this.editorGutenbergComponent.getSelectedBlockElementHandle(
			blockEditorSelector
		);

		// Dismiss the block inserter if viewport is larger than mobile to
		// ensure no interference from the block inserter in subsequent actions on the editor.
		// In mobile, the block inserter will auto-close.
		if ( envVariables.VIEWPORT_NAME !== 'mobile' ) {
			await this.editorToolbarComponent.closeBlockInserter();
		}

		// Return an ElementHandle pointing to the block for compatibility
		// with existing specs.
		return blockHandle;
	}

	/**
	 * Adds a pattern from the block inserter panel.
	 *
	 * The name is expected to be formatted in the same manner as it
	 * appears on the label when visible in the block inserter panel.
	 *
	 * Example:
	 * 		- Two images side by side
	 *
	 * @param {string} patternName Name of the pattern to insert.
	 */
	async addPattern( patternName: string ): Promise< void > {
		await this.editorGutenbergComponent.resetSelectedBlock();
		await this.editorToolbarComponent.openBlockInserter();
		await this.editorGutenbergComponent.searchBlockInserter( patternName );
		await this.editorGutenbergComponent.selectBlockInserterResult( patternName, {
			type: 'pattern',
		} );

		const insertConfirmationToastLocator = this.frameLocator.locator(
			`.components-snackbar__content:text('Block pattern "${ patternName }" inserted.')`
		);
		await insertConfirmationToastLocator.waitFor();
	}

	/**
	 * Remove the block from the editor.
	 *
	 * This method requires the handle to the block in question to be passed in as parameter.
	 *
	 * @param {ElementHandle} blockHandle ElementHandle of the block to be removed.
	 */
	async removeBlock( blockHandle: ElementHandle ): Promise< void > {
		await blockHandle.click();
		await this.page.keyboard.press( 'Backspace' );
	}

	/* Settings Sidebar */

	/**
	 * Opens the Settings sidebar.
	 */
	async openSettings(): Promise< void > {
		await this.editorToolbarComponent.openSettings();
	}

	/**
	 * Closes the Settings sidebar.
	 */
	async closeSettings(): Promise< void > {
		// On mobile, the settings panel close button is located on the settings panel itself.
		if ( envVariables.VIEWPORT_NAME === 'mobile' ) {
			await this.editorSettingsSidebarComponent.closeSidebarForMobile();
		} else {
			await this.editorToolbarComponent.closeSettings();
		}
	}

	/**
	 * Clicks and activates the given tab in the Editor Settings sidebar.
	 *
	 * @param {EditorSidebarTab} tab Name of the tab to activate.
	 */
	async clickSettingsTab( tab: EditorSidebarTab ): Promise< void > {
		await this.editorSettingsSidebarComponent.clickTab( tab );
	}

	/**
	 * Sets the article's privacy/visibility option.
	 *
	 * @param {PrivacyOptions} visibility Visibility option for the article.
	 * @param param1 Object parameters.
	 * @param {string} param1.password Password for the post.
	 */
	async setArticleVisibility(
		visibility: PrivacyOptions,
		{ password }: { password?: string }
	): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );

		await this.editorSettingsSidebarComponent.expandSection( 'Status & Visibility' );
		await this.editorSettingsSidebarComponent.openVisibilityOptions();
		await this.editorSettingsSidebarComponent.selectVisibility( visibility, {
			password: password,
		} );
		await this.editorSettingsSidebarComponent.closeVisibilityOptions();
	}

	/**
	 * View revisions for the article.
	 */
	async viewRevisions(): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );
		await this.editorSettingsSidebarComponent.showRevisions();
	}

	/**
	 * Select a category for the article.
	 *
	 * @param {string} name Name of the category.
	 */
	async selectCategory( name: string ): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );
		await this.editorSettingsSidebarComponent.expandSection( 'Categories' );
		await this.editorSettingsSidebarComponent.checkCategory( name );
	}

	/**
	 * Adds the given tag to the article.
	 *
	 * @param {string} tag Tag to be added to article.
	 */
	async addTag( tag: string ): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );
		await this.editorSettingsSidebarComponent.expandSection( 'Tags' );
		await this.editorSettingsSidebarComponent.enterTag( tag );
	}

	/**
	 * Sets the URL slug.
	 *
	 * @param {string} slug Desired URL slug.
	 */
	async setURLSlug( slug: string ): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );
		await this.editorSettingsSidebarComponent.expandSection( 'Permalink' );
		await this.editorSettingsSidebarComponent.enterUrlSlug( slug );
	}

	/* Publish, Draft & Schedule */

	/**
	 * Publishes the post or page.
	 *
	 * @param {boolean} visit Whether to then visit the page.
	 * @returns {URL} Published article's URL.
	 */
	async publish( { visit = false }: { visit?: boolean } = {} ): Promise< URL > {
		// Click on the main publish action button on the toolbar.
		await this.editorToolbarComponent.clickPublish();

		if ( await this.editorPublishPanelComponent.panelIsOpen() ) {
			// Invoke the second stage of the publish step which handles the
			// publish checklist panel if it is present.
			await this.editorPublishPanelComponent.publish();
		}

		// In some cases the post may be published but the EditorPublishPanelComponent
		// is either not present or forcibly dismissed due to a bug.
		// eg. publishing a post with some of the Jetpack Earn blocks.
		// By racing the two methods of obtaining the published article's URL, we can
		// guarantee that one or the other works.
		const publishedURL: URL = await Promise.race( [
			this.editorPublishPanelComponent.getPublishedURL(),
			this.getPublishedURLFromToast(),
		] );

		if ( visit ) {
			await this.visitPublishedPost( publishedURL.href );
		}
		return publishedURL;
	}

	/**
	 * Schedules an article.
	 *
	 * This method requires the Editor Settings sidebar to be open.
	 */
	async schedule( date: Schedule ): Promise< void > {
		await Promise.race( [
			this.editorSettingsSidebarComponent.clickTab( 'Page' ),
			this.editorSettingsSidebarComponent.clickTab( 'Post' ),
		] );

		await this.editorSettingsSidebarComponent.expandSection( 'Status & Visibility' );
		await this.editorSettingsSidebarComponent.openSchedule();
		await this.editorSettingsSidebarComponent.setScheduleDetails( date );
		await this.editorSettingsSidebarComponent.closeSchedule();
	}

	/**
	 * Unpublishes the post or page by switching to draft.
	 */
	async unpublish(): Promise< void > {
		await this.editorToolbarComponent.switchToDraft();

		const frame = await this.getEditorFrame();
		// @TODO: eventually refactor this out to a ConfirmationDialogComponent.
		await frame.click( `div[role="dialog"] button:has-text("OK")` );
		// @TODO: eventually refactor this out to a EditorToastNotificationComponent.
		await frame.waitForSelector(
			'.components-editor-notices__snackbar :has-text("Post reverted to draft.")'
		);
	}

	/**
	 * Obtains the published article's URL from post-publish panels.
	 *
	 * This method is only able to obtain the published article's URL if immediately
	 * preceded by the action of publishing the article *and* the post-publish panel
	 * being visible.
	 *
	 * @returns {URL} Published article's URL.
	 */
	async getPublishedURLFromToast(): Promise< URL > {
		const frame = await this.getEditorFrame();

		const toastLocator = frame.locator( selectors.toastViewPostLink );
		const publishedURL = ( await toastLocator.getAttribute( 'href' ) ) as string;
		return new URL( publishedURL );
	}

	/**
	 * Saves the currently open post as draft.
	 */
	async saveDraft(): Promise< void > {
		await this.editorToolbarComponent.saveDraft();
	}

	/**
	 * Visits the published entry from the post-publish sidebar.
	 *
	 * @returns {Promise<void>} No return value.
	 */
	private async visitPublishedPost( url: string ): Promise< void > {
		// Some blocks, like "Click To Tweet" or "Logos" cause the post-publish
		// panel to close immediately and leave the post in the unsaved state for
		// some reason. Since the post state is unsaved, the warning dialog will be
		// displayed on the published post link click. By default, Playwright will
		// dismiss the dialog so we need this listener to accept it and open the
		// published post.
		//
		// Once https://github.com/Automattic/wp-calypso/issues/54421 is resolved,
		// this listener can be removed.
		this.page.once( 'dialog', async ( dialog ) => {
			await dialog.accept();
		} );

		await this.page.goto( url, { waitUntil: 'domcontentloaded' } );

		await reloadAndRetry( this.page, confirmPostShown );

		/**
		 * Closure to confirm that post is shown on screen as expected.
		 *
		 * In rare cases, visiting the post immediately after it has been published can result
		 * in the post not being visible to the public yet. In such cases, an error message is
		 * instead shown to the user.
		 *
		 * When used in conjunction with `reloadAndRetry` this method will reload the page
		 * multiple times to ensure the post content is shown.
		 *
		 * @param page
		 */
		async function confirmPostShown( page: Page ): Promise< void > {
			await page.waitForSelector( '.entry-content', { timeout: 15 * 1000 } );
		}
	}

	/* Previews */

	/**
	 * Launches the Preview as mobile viewport.
	 *
	 * For Mobile viewports, this method will return a reference to a popup Page.
	 * For Desktop and Tablet viewports, an error is thrown.
	 *
	 * @returns {Promise<Page>} Handler for the popup page.
	 * @throws {Error} If the current viewport is not of Mobile.
	 */
	async previewAsMobile(): Promise< Page > {
		if ( envVariables.VIEWPORT_NAME !== 'mobile' ) {
			throw new Error(
				`This method only works in mobile viewport, current viewport: ${ envVariables.VIEWPORT_NAME } `
			);
		}
		return await this.editorToolbarComponent.openMobilePreview();
	}

	/**
	 * Launches the Preview as non-mobile viewport.
	 *
	 * For Desktop and Tablet viewports, this method will not return any value.
	 * For Mobile viewport, an error is thrown.
	 *
	 * @param {PreviewOptions} target Target preview size.
	 * @returns {Page|void} Handler for the Page object on mobile. Void otherwise.
	 * @throws {Error} If the current viewport is not of Desktop or Tablet.
	 */
	async previewAsDesktop( target: PreviewOptions ): Promise< void > {
		if ( envVariables.VIEWPORT_NAME === 'mobile' ) {
			throw new Error(
				`This method only works in non-mobile viewport, current viewport: ${ envVariables.VIEWPORT_NAME } `
			);
		}
		await this.editorToolbarComponent.openDesktopPreview( target );
	}

	/**
	 * Closes the preview.
	 *
	 * For Desktop viewports, this method will return the editor pane to the default
	 * value of `desktop`.
	 * For Mobile viewports, this method will do nothing.
	 */
	async closePreview(): Promise< void > {
		if ( envVariables.VIEWPORT_NAME === 'mobile' ) {
			return;
		}
		await this.editorToolbarComponent.openDesktopPreview( 'Desktop' );
	}

	/* Misc */

	/**
	 * Leave the editor to return to the Calypso dashboard.
	 *
	 * On desktop sized viewport, this method first opens the editor navigation
	 * sidebar, then clicks on the `Dashboard` link.
	 *
	 * On mobile sized viewport, this method clicks on Navbar > My Sites.
	 *
	 * The resulting page can change based on where you come from, and the viewport. Either way, the resulting landing spot
	 * will have access to the Calyspo sidebar, allowing navigation around Calypso.
	 */
	async exitEditor(): Promise< void > {
		await this.editorNavSidebarComponent.openSidebar();

		// There are three different places to return to,
		// depending on how the editor was entered.
		const navigationPromise = Promise.race( [
			this.page.waitForNavigation( { url: '**/home/**' } ),
			this.page.waitForNavigation( { url: '**/posts/**' } ),
			this.page.waitForNavigation( { url: '**/pages/**' } ),
		] );
		const actions: Promise< unknown >[] = [ navigationPromise ];

		if ( envVariables.VIEWPORT_NAME === 'mobile' ) {
			// Mobile viewports do not use an EditorNavSidebar.
			// Instead, the regular NavBar is used, and the
			// `My Sites` button exits the editor.
			const navbarComponent = new NavbarComponent( this.page );
			actions.push( navbarComponent.clickMySites() );
		} else {
			actions.push( this.editorNavSidebarComponent.exitEditor() );
		}

		// Perform the actions and resolve promises.
		await Promise.all( actions );
	}

	/**
	 * Checks whether the editor has any block warnings/errors displaying.
	 *
	 * @returns {Promise<boolean>} True if there are block warnings/errors.
	 * False otherwise.
	 */
	async editorHasBlockWarnings(): Promise< boolean > {
		return await this.editorGutenbergComponent.editorHasBlockWarning();
	}
}