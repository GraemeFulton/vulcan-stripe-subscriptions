import React, { Component } from "react";
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { getSetting }
    from 'meteor/vulcan:core';

/**
 * Vulcan HOC for Stripe Elements wrapper
 * https://stripe.com/docs/billing/subscriptions/fixed-price#collect-payment
 * To use Element components, wrap the root of your React app in an Elements provider. 
 * Call loadStripe with your publishable key and pass the returned Promise to the Elements provider.
 */
const stripeSettings = getSetting('stripe');
//get stripe publishable key
const stripePublishableKey =
    Meteor.isDevelopment || stripeSettings && stripeSettings.alwaysUseTest
        ? stripeSettings && stripeSettings.publishableKeyTest
        : stripeSettings && stripeSettings.publishableKey;

// Make sure to call `loadStripe` outside of a component’s render to avoid
// recreating the `Stripe` object on every render.
//(https://stripe.com/docs/billing/subscriptions/fixed-price#collect-payment)
const stripePromise = loadStripe(stripePublishableKey);


function withStripeElements(Component) {

    return function (props) {
        return (
            <Elements 
            // options={{
            //     fonts: [
            //       {
            //         cssSrc:
            //           "https://fonts.googleapis.com/css?family=Poppins:300,300i,400,500,600"
            //       }
            //     ]
            //   }}
            stripe={stripePromise}>
                <Component {...props} />
            </Elements>
        );
    };
}
export default withStripeElements;
