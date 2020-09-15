import React from 'react';
import PropTypes from 'prop-types';
import {
    Components,
    registerComponent,
    getSetting,
    withCurrentUser,
    withMessages,
    withMutation
} from 'meteor/vulcan:core';
import { Products } from '../../modules/products.js';
import { withRouter } from 'react-router';
import CheckoutForm from './CheckoutForm';
import withStripeElements from '../../hocs/withStripeElements'

class CheckoutModal extends React.Component {


    render() {

        return (
            <Components.ModalTrigger size={'large'} title="Checkout"
                component={this.props.button ? this.props.button :
                   
                   <Components.Button variant="primary">
                        {this.props.buttonText ? this.props.buttonText : 'Buy Now'}
                    </Components.Button>

                }>

                <CheckoutForm
                    vulcanProductKey={this.props.vulcanProductKey}
                    currentUser={this.props.currentUser}
                    stripeCreateCustomer={this.props.stripeCreateCustomer}
                    stripeCreateSubscription={this.props.stripeCreateSubscription}
                    associatedCollection={this.props.associatedCollection}
                    associatedDocument={this.props.associatedDocument}
                />

            </Components.ModalTrigger>

        );
    }
}

const stripeCreateCustomer = {
    name: 'stripeCreateCustomer',
    args: { email: 'String' }
};
const stripeCreateSubscription = {
    name: 'stripeCreateSubscription',
    args: {
        customerId: 'String', paymentMethodId: 'String', product: 'JSON',
        associatedCollection: 'String', associatedDocument: 'String', retry: 'Boolean',
        invoiceId: 'String', userId: 'String'
    }
};
registerComponent({
    name: 'CheckoutModal',
    component: CheckoutModal,
    hocs: [withCurrentUser, withStripeElements,
        [withMutation, stripeCreateCustomer],
        [withMutation, stripeCreateSubscription],
        withRouter]
});
