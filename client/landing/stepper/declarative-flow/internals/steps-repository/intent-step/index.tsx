/* eslint-disable wpcalypso/jsx-classname-namespace */
import { IntentScreen, StepContainer } from '@automattic/onboarding';
import { useTranslate } from 'i18n-calypso';
import intentImageUrl from 'calypso/assets/images/onboarding/intent.svg';
import FormattedHeader from 'calypso/components/formatted-header';
import { recordTracksEvent } from 'calypso/lib/analytics/tracks';
import { preventWidows } from 'calypso/lib/formatting';
import { useIntents, useIntentsAlt } from './intents';
import type { StepPath } from '../';
import type { Step } from '../../types';
import './style.scss';

/**
 * The intent capture step
 */
const IntentStep: Step = function IntentStep( { navigation } ) {
	const { goToStep } = navigation;
	const translate = useTranslate();
	const headerText = translate( 'Where will you start?' );
	const subHeaderText = translate( 'You can change your mind at any time.' );

	const intents = useIntents();
	// TODO: I need to get the site slug to get the siteId to get the canImport
	const intentsAlt = useIntentsAlt( true );

	const submitIntent = ( intent: StepPath ) => {
		const providedDependencies = { intent };
		recordTracksEvent( 'calypso_signup_intent_select', providedDependencies );

		goToStep?.( intent );
	};

	return (
		<StepContainer
			headerImageUrl={ intentImageUrl }
			hideSkip
			hideBack
			isHorizontalLayout={ true }
			className={ 'intent-step' }
			formattedHeader={
				<FormattedHeader
					id={ 'intent-header' }
					headerText={ headerText }
					subHeaderText={ subHeaderText }
					align={ 'left' }
				/>
			}
			stepContent={
				<IntentScreen
					intents={ intents }
					intentsAlt={ intentsAlt }
					onSelect={ submitIntent }
					preventWidows={ preventWidows }
				/>
			}
			recordTracksEvent={ recordTracksEvent }
		/>
	);
};

export default IntentStep;
