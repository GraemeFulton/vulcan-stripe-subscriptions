import React, { useState } from 'react';

import CardSection from '../parts/CardSection.jsx';
import { Products } from '../../modules/products.js';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

import { Redirect } from "react-router-dom";
import { Link } from "react-router-dom";
import { Components } from 'meteor/vulcan:core';


export default CheckoutForm = ({ vulcanProductKey,
    associatedCollection, associatedDocument,
    ...props }) => {

    // get the product from Products (either object or function applied to doc)
    // or default to sample product
    const sampleProduct = {
        price: 30000,
        name: 'My Cool Product',
        description: 'This product is awesome.',
        currency: 'USD',
        term: 'year'
    };
    const definedProduct = Products[vulcanProductKey];
    const productSelected = typeof definedProduct ? definedProduct : sampleProduct;

    const stripe = useStripe();
    const elements = useElements();
    const [subscribing, setSubscribing] = useState(false);
    const [customerId, setCustomerId] = useState(false);
    const [checked, setChecked] = useState(false);
    const [accountInformation, setAccountInformation] = useState(null);
    let [errorToDisplay, setErrorToDisplay] = useState('');

    function handlePaymentThatRequiresCustomerAction({
        subscription,
        invoice,
        priceId,
        paymentMethodId,
        isRetry,
    }) {
        if (subscription && subscription.status === 'active' || subscription.status == 'trialing') {
            // subscription is active, no customer actions required.
            return { subscription, priceId, paymentMethodId };
        }

        // If it's a first payment attempt, the payment intent is on the subscription latest invoice.
        // If it's a retry, the payment intent will be on the invoice itself.
        let paymentIntent = invoice
            ? invoice.payment_intent
            : subscription.latest_invoice.payment_intent;

        if (
            paymentIntent.status === 'requires_action' ||
            (isRetry === true && paymentIntent.status === 'requires_payment_method')
        ) {
            return stripe
                .confirmCardPayment(paymentIntent.client_secret, {
                    payment_method: paymentMethodId,
                })
                .then((result) => {
                    if (result.error) {
                        // start code flow to handle updating the payment details
                        // Display error message in your UI.
                        // The card was declined (i.e. insufficient funds, card has expired, etc)
                        throw result;
                    } else {
                        if (result.paymentIntent.status === 'succeeded' || result.paymentIntent.status === 'trialing') {
                            // There's a risk of the customer closing the window before callback
                            // execution. To handle this case, set up a webhook endpoint and
                            // listen to invoice.payment_succeeded. This webhook endpoint
                            // returns an Invoice.

                            return {
                                priceId: priceId,
                                subscription: subscription,
                                invoice: invoice,
                                paymentMethodId: paymentMethodId,
                                retrySuccess: result.paymentIntent.status
                            };
                        }
                    }
                });
        } else {
            // No customer action needed
            return { subscription, priceId, paymentMethodId };
        }
    }

    function handleRequiresPaymentMethod({
        subscription,
        paymentMethodId,
        priceId,
    }) {
        if (subscription.status === 'active' || subscription.status === 'trialing') {
            // subscription is active, no customer actions required.
            return { subscription, priceId, paymentMethodId };
        } else if (
            subscription.latest_invoice.payment_intent.status ===
            'requires_payment_method'
        ) {
            // Using localStorage to store the state of the retry here
            // (feel free to replace with what you prefer)
            // Store the latest invoice ID and status
            localStorage.setItem('latestInvoiceId', subscription.latest_invoice.id);
            localStorage.setItem(
                'latestInvoicePaymentIntentStatus',
                subscription.latest_invoice.payment_intent.status
            );
            throw new Error('Your card was declined.');
        } else {
            return { subscription, priceId, paymentMethodId };
        }
    }

    async function retryInvoiceWithNewPaymentMethod({ customerId, paymentMethodId, invoiceId }) {
        const priceId = productSelected.name.toUpperCase();
        return (
            await props.stripeCreateSubscription({
                customerId,
                paymentMethodId,
                invoiceId,
                userId: props.currentUser._id,
                retry: true
            }).then((response) => {
                return response;
            })
                // If the card is declined, display an error to the user.
                .then((result) => {
                    if (result.error) {
                        // The card had an error when trying to attach it to a customer.
                        throw result;
                    }
                    return result;
                })
                // Normalize the result to contain the object returned by Stripe.
                // Add the addional details we need.
                .then((result) => {
                    return {
                        // Use the Stripe 'object' property on the
                        // returned result to understand what object is returned.
                        invoice: result.data.stripeCreateSubscription && result.data.stripeCreateSubscription.invoice,
                        paymentMethodId: paymentMethodId,
                        priceId: priceId,
                        isRetry: true,
                    };
                })
                // Some payment methods require a customer to be on session
                // to complete the payment process. Check the status of the
                // payment intent to handle these actions.
                .then(handlePaymentThatRequiresCustomerAction)
                // No more actions required. Provision your service for the user.
                .then(onSubscriptionComplete)
                .catch((error) => {
                    console.log(error);
                    // An error has happened. Display the failure to the user here.
                    setSubscribing(false);
                    setErrorToDisplay(error && error.error && error.error.decline_code);
                })
        );
    }

    function onSubscriptionComplete(result) {
        // Payment was successful. Provision access to your service.
        // Remove invoice from localstorage because payment is now complete.
        // clearCache();
        if (result && !result.subscription) {
            const subscription = { id: result.invoice.subscription };
            result.subscription = subscription;
            localStorage.removeItem('latestInvoiceId');
            localStorage.removeItem('latestInvoicePaymentIntentStatus');
        }

        setAccountInformation(result);
        // Change your UI to show a success message to your customer.
        // onSubscriptionSampleDemoComplete(result);
        // Call your backend to grant access to your service based on
        // the product your customer subscribed to.
        // Get the product by using result.subscription.price.product
    }

    async function getCustomerId() {
        //GET STRIPE CUSTOMER ID
        // Separate from the Stripe example, call the stripeCreatCustomer mutation (added as a HOC)
        let customerId = null
        await props.stripeCreateCustomer({
            email: props.currentUser.email,
        }).then((result) => {
            if (result.data.stripeCreateCustomer.stripeCustomerId) {
                customerId = result.data.stripeCreateCustomer.stripeCustomerId
            }
            // console.log(customerId)
        }).catch()

        if (!customerId) {
            //throw error if there's no customer id
            return false
        }
        return customerId
    }

    async function createSubscription({ customerId, paymentMethodId }) {
        //CREATE SUBSCRIPTION 
        //from https://stripe.com/docs/billing/subscriptions/fixed-price#create-subscription
        //adapted to use graphql mutation  instead of POST
        const priceId = productSelected.name.toUpperCase();

        return (
            await props.stripeCreateSubscription({
                //    customerId, paymentMethodId, priceId:productSelected.priceId
                customerId, paymentMethodId, product: productSelected,
                associatedCollection, associatedDocument,
                userId: props.currentUser._id
            }).then((response) => {
                return response;
            }).then((result) => {
                if (result.error) {
                    // The card had an error when trying to attach it to a customer
                    throw result;
                }
                return result;
            })
                // Normalize the result to contain the object returned
                // by Stripe. Add the addional details we need.
                .then((result) => {
                    if (result.data.stripeCreateSubscription && result.data.stripeCreateSubscription.subscription) {
                        return {
                            // Use the Stripe 'object' property on the
                            // returned result to understand what object is returned.
                            subscription: result.data.stripeCreateSubscription.subscription,
                            paymentMethodId: paymentMethodId,
                            priceId: productSelected.name,
                        };
                    }
                })
                // Some payment methods require a customer to do additional
                // authentication with their financial institution.
                // Eg: 2FA for cards.
                .then(handlePaymentThatRequiresCustomerAction)
                // If attaching this card to a Customer object succeeds,
                // but attempts to charge the customer fail. You will
                // get a requires_payment_method error.
                .then(handleRequiresPaymentMethod)
                // No more actions required. Provision your service for the user.
                .then(onSubscriptionComplete)
                .catch((error) => {
                    // An error has happened. Display the failure to the user here.
                    // We utilize the HTML element we created.
                    setSubscribing(false);
                    setErrorToDisplay(error.message || error.error.decline_code);
                })
        )
    }

    const handleSubmit = async (event) => {
        // Block native form submission.
        event.preventDefault();

        setSubscribing(true);

        if (!stripe || !elements) {
            // Stripe.js has not loaded yet. Make sure to disable
            // form submission until Stripe.js has loaded.
            return;
        }

        // Get a reference to a mounted CardElement. Elements knows how
        // to find your CardElement because there can only ever be one of
        // each type of element.
        const cardElement = elements.getElement(CardElement);

        // If a previous payment was attempted, get the lastest invoice
        const latestInvoicePaymentIntentStatus = localStorage.getItem(
            'latestInvoicePaymentIntentStatus'
        );

        // Use your card Element with other Stripe.js APIs
        const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
        });

        if (error) {
            console.log('[createPaymentMethod error]', error);
            setSubscribing(false);
            setErrorToDisplay(error && error.message);
        } else {
            // console.log('[PaymentMethod]', paymentMethod);
            const paymentMethodId = paymentMethod.id;
            if (latestInvoicePaymentIntentStatus === 'requires_payment_method') {
                //@TODO set up graphql endpoint for retryInvoiceWithNewPaymentMethod

                // Update the payment method and retry invoice payment
                const invoiceId = localStorage.getItem('latestInvoiceId');
                const customerId = await getCustomerId();

                retryInvoiceWithNewPaymentMethod({
                    customerId,
                    paymentMethodId: paymentMethodId,
                    invoiceId: invoiceId,
                    priceId: productSelected.name
                });
            } else {
                const customerId = await getCustomerId();
                // Create the subscription
                createSubscription({
                    customerId,
                    paymentMethodId: paymentMethodId,
                });
            }
        }
    };

    if (accountInformation &&
        ((accountInformation.subscription.status == 'active' || accountInformation.subscription.status == 'trialing')
            || accountInformation.retrySuccess == 'succeeded')) {
        return (
            <>
                <h1>
                    {accountInformation.subscription.status == 'active' || accountInformation.subscription.status == 'succeeded'
                        ? 'Payment successful'
                        : accountInformation.subscription.status == 'trialing' &&
                        'Trial activated'}
                </h1>
                <Components.Button variant="primary">
                    <Link to="/account">
                        Go to dashboard
                    </Link>
                </Components.Button>
            </>
            // <Redirect
            //     to={{
            //         pathname: '/account',
            //         state: { accountInformation: accountInformation },
            //     }}
            // />
        );
    } else {
        return (
            <div>
                <h2>
                    Review your plan and enter your payment details.
                </h2>
                <p style={{ marginTop: '24px' }}>
                    → <span>{productSelected.price} / {productSelected.term}</span>
                </p>
                <p>
                    → Subscribing to{' '}
                    <span style={{ fontWeight: 600 }}>{productSelected.name}</span>
                </p>

                <div>
                    <form id="payment-form" style={{ marginTop: '24px' }} onSubmit={handleSubmit}>
                        <div>
                            <div>
                                <label style={{ textTransform: 'uppercase' }}>
                                    Card Details
                                </label>
                                <div id="card-element">
                                    <CardElement
                                        options={{
                                            style: {
                                                base: {
                                                    fontSize: '16px',
                                                    color: '#32325d',
                                                    // fontFamily:
                                                    //     '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
                                                    '::placeholder': {
                                                        color: '#a0aec0',
                                                    },
                                                },
                                                invalid: {
                                                    color: '#9e2146',
                                                },
                                            },
                                        }}
                                    />
                                </div>
                                <div role="alert">
                                    {errorToDisplay ? errorToDisplay : null}
                                </div>
                            </div>
                        </div>
                        <Components.Button
                            id="submit-premium"
                            variant="primary"
                            disabled={subscribing}
                            style={{ cursor: (subscribing ? 'wait' : 'pointer'), marginTop: '12px' }}
                            type="submit"
                        >
                            {subscribing ? 'Processing...' : `Pay ${productSelected.price}`}
                        </Components.Button>
                    </form>
                </div>
            </div>
        );
    }
};