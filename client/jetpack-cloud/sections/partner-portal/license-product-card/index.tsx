import { Gridicon } from '@automattic/components';
import classNames from 'classnames';
import { ReactElement } from 'react';
import './style.scss';

export default function LicenseProductCard( props: any ): ReactElement {
	const { label, orderIndex } = props.product;
	const productTitle = label.replace( 'Jetpack ', '' ).replace( '(', '' ).replace( ')', '' );

	return (
		<div
			onClick={ () => props.onSelectProduct( props.product ) }
			onKeyDown={ () => props.onSelectProduct( props.product ) }
			role="radio"
			tabIndex={ orderIndex }
			aria-checked={ props.isSelected }
			className={ classNames( {
				'license-product-card': true,
				selected: props.isSelected,
			} ) }
		>
			<div className="license-product-card__inner">
				<div className="license-product-card__details">
					<div className="license-product-card__top">
						<h3 className="license-product-card__title">{ productTitle }</h3>
						<div className="license-product-card__radio">
							{ props.isSelected && <Gridicon icon="checkmark" /> }
						</div>
					</div>
					<h3 className="license-product-card__cost"></h3>
					<p className="license-product-card__text"></p>
				</div>
			</div>
		</div>
	);
}
