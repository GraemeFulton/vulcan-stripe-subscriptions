/**
 * This is basically the stripe sample on github
 * https://github.com/stripe-samples/subscription-use-cases/blob/master/fixed-price-subscriptions/client/react/src/PaymentForm.js
 */

import React, { useState } from 'react';
import {
    registerComponent,
    Components,
    withMutation,
    withCurrentUser
} from 'meteor/vulcan:core';
import { Link } from "react-router-dom";
import { Products } from '../../modules/products.js';
import Switch from "react-switch";
import { withRouter } from 'react-router';
import { Redirect } from "react-router-dom";

import withStripeElements from '../../hocs/withStripeElements'

import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import CardSection from '../parts/CardSection.jsx';

const CheckoutPage = ({ vulcanProductKey,
    associatedCollection, associatedDocument,
    ...props }) => {

    //if no vulcanProducKey props
    if (!vulcanProductKey) {
        //check if it's passed by location
        vulcanProductKey = (props.location && props.location.state) ? props.location.state.vulcanProductKey : null
        //if still no vulcanProductKey, go back right away - a product has not been chosen
        if (!vulcanProductKey) {
            //(e.g. they visit the checkout url directly)
            if (props.location.state && props.location.state.from) {
                props.history.goBack()
            } else {
                props.history.push('/')
                return false
            }
        }
    }
    // //if no associatedCollection props
    if (!associatedCollection) {
        //check if it's passed by location
        associatedCollection = (props.location && props.location.state) ? props.location.state.associatedCollection : null
    }
    //if no associatedDocument props
    if (!associatedDocument) {
        //check if it's passed by location
        associatedDocument = (props.location && props.location.state) ? props.location.state.associatedDocument : null
    }

    // get the product from Products (either object or function applied to doc)
    // or default to sample product
    const sampleProduct = {
        price: 10000,
        name: 'My Cool Product',
        description: 'This product is awesome.',
        currency: 'USD',
    };
    const definedProduct = Products[vulcanProductKey];
    const productSelected = typeof definedProduct ? definedProduct : sampleProduct;

    // productSelected = { name: 'Letter Pro', price: '$20' }
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
                    console.log(result)
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

//refetch
// props.currentUser.refetch()??

        return (
            <div className="page default-screen">

                <div style={{ maxWidth: '1200px' }} className="mx-auto flex items-center pt-6 md:pt-10 px-3 md:px-0 flex items-center justify-between relative">
                    {/* NAV LOGO*/}
                    <div className="flex items-center cursor-pointer mx-auto">
                        <Link to="/">
                            <img
                                className="mr-1 -ml-4 inline-block -mt-2"
                                src="/packages/letter-app/lib/static/svg-icons/logo-dark.svg"
                                width="30"
                            />
                            <h1 className="inline-block pt-1 text-xl tracking-normal text-royalblue-800">Letter</h1>
                        </Link>
                    </div>
                    {/* NAV LOGO END*/}
                    {/* CLOSE BUTTON */}
                    <div
                        onClick={(props.location.state && props.location.state.from) ? () => props.history.goBack() : () => props.history.push('/')}
                        className="right-0 absolute mr-8 z-50 cursor-pointer opacity-75 hover:opacity-100"
                        style={{ height: '32px', width: "32px" }}>
                        <img src="/packages/letter-app/lib/static/svg-icons/icon-close.svg" />
                    </div>
                    {/* CLOSE BUTTON END */}
                </div>
                <div className="relative max-w-md mx-auto mt-16 px-6 md:px-0" style={{ maxWidth: '32rem' }}>
                    <div className="w-full p-8 mx-auto inline-block border rounded-md content-center text-center">
                        <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                            <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#39959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>

                        <h1 className="text-xl mt-4 content-center">
                            {accountInformation.subscription.status == 'active' || accountInformation.subscription.status == 'succeeded'
                                ? 'Payment Successful'
                                : accountInformation.subscription.status == 'trialing' &&
                                'Trial activated'}
                        </h1>
                        <p className="text-gray-700 text-sm mx-auto py-3" style={{ maxWidth: '24rem' }}>
                        You're upgraded to Letter Pro! Thanks for your payment - your support makes our indie product possible.
                        </p>
                        <Link 
                        to={{
                            pathname: "/",
                            state: { intent: 'payment_complete' }
                          }}>
                            <button className="bg-royalblue-500 hover:bg-royalblue-700 text-white font-medium py-3 px-5 rounded-full mt-2 text-sm">
                                Continue to Dashboard
                            </button>
                        </Link>
                    </div>
                </div>
                <img className="hidden md:block absolute top-0 right-0 pt-24" style={{ width: "340px" }} src={"/packages/letter-app/lib/static/plane-top.svg"} />
                <img className="hidden md:block absolute bottom-0 left-0" style={{ width: "340px", marginBottom: '14vh' }} src={"/packages/letter-app/lib/static/plane-bottom.svg"} />

            </div>
            // <Redirect
            //     to={{
            //         pathname: '/account',
            //         state: { accountInformation: accountInformation },
            //     }}
            // />
        );
    } else {
        return (
            <div className="page default-screen" id="payment-form">
                <div style={{ maxWidth: '1200px' }} className="mx-auto flex items-center pt-6 md:pt-10 px-3 md:px-0 flex items-center justify-between relative">
                    {/* NAV LOGO*/}
                    <div className="flex items-center cursor-pointer mx-auto">
                        <Link to="/">
                            <img
                                className="mr-1 -ml-4 inline-block -mt-2"
                                src="/packages/letter-app/lib/static/svg-icons/logo-dark.svg"
                                width="30"
                            />
                            <h1 className="inline-block pt-1 text-xl tracking-normal text-royalblue-800">Letter</h1>
                        </Link>
                    </div>
                    {/* NAV LOGO END*/}
                    {/* CLOSE BUTTON */}
                    <div
                        onClick={(props.location.state && props.location.state.from) ? () => props.history.goBack() : () => props.history.push('/')}
                        className="z-50 cursor-pointer opacity-75 hover:opacity-100"
                        style={{ height: '32px', width: "32px" }}>
                        <img src="/packages/letter-app/lib/static/svg-icons/icon-close.svg" />
                    </div>
                    {/* CLOSE BUTTON END */}
                </div>

                <div className="max-w-md mx-auto mt-8" style={{ maxWidth: '48rem' }}>
                    <h1 className="mx-auto text-center font-display text-2xl">
                        Complete Your Order
                    </h1>
                    <div className="mt-8 pb-10 w-full flex mx-auto inline-block rounded-md">

                        <div className="w-8/12 border shadow-sm mr-3 p-8 rounded-md border-1 border-gray-200">
                            {/* <h2 className="font-secondary text-sm mb-3 text-gray-800">
                                Card Details.
                            </h2>
                            <p className="text-gray-600 text-sm font-secondary">
                                → {productSelected.term == 'year' && <span className="line-through">$240 / year</span>}&nbsp;<span>{productSelected.price} / {productSelected.term}</span>
                            </p>
                            <p className="font-secondary text-gray-600 text-sm mb-4">
                                → Subscribing to{' '}
                                <span className="font-bold">{productSelected.name}</span>
                            </p> */}

                            <div className="w-full">
                                <form id="payment-form" onSubmit={handleSubmit}>
                                    <div className="flex flex-wrap -mx-3 mb-8">
                                        <div className="w-full px-3 mb-0">
                                            <label className="block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2">
                                                Card Details
                                        </label>
                                            <div
                                                className="appearance-none block w-full p-3 text-gray-700 border border-gray-300 rounded-md  leading-tight bg-gray-100 shadow-sm"
                                                id="card-element"
                                            >
                                                <CardElement
                                                    options={{
                                                        style: {
                                                            base: {
                                                                fontSize: '14px',
                                                                color: '#32325d',
                                                                fontFamily:'Open Sans, -apple-system, sans-serif',
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
                                            <div className="text-gray-700 text-base mt-2" role="alert">
                                                {errorToDisplay ? errorToDisplay : null}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        id="submit-premium"
                                        disabled={subscribing}
                                        className={`${subscribing && 'cursor-wait'} bg-green-500 hover:shadow font-medium focus:shadow-outline text-white focus:bg-green-500 hover:bg-green-400 py-3 px-5 rounded-full`}
                                        type="submit"
                                    >
                                        <div className="text-sm">
                                            <div>{subscribing ? 'Processing...' : `Pay ${productSelected.price} and upgrade`}</div>
                                        </div>
                                    </button>
                                </form>
                                {/* <Switch className="mt-6" handleDiameter={24} height={28} width={48} onColor={'#4CC4D1'} offColor={"#babbd3"}
                                    checkedIcon={false}
                                    uncheckedIcon={false}
                                    onChange={() => setChecked(checked)} checked={checked} /> */}
                            </div>
                        </div>

                        <div className="w-5/12 px-6  border-gray-400 rounded-md">
                            {/* <img className="mt-8 shadow-sm rounded-lg" src="https://s3-us-west-1.amazonaws.com/tinify-bucket/%2Fprototypr%2Ftemp%2F1580579385905-1580579385905.png" /> */}
                            <p className="mt-4 font-secondary text-lg font-bold text-gray-900">Pro</p>
                            <p className="font-secondary text-sm text-gray-700">
                                Full access{productSelected.term == 'year' &&
                                    <span>,
                                    <span className="text-green-600 font-semibold">
                                            &nbsp;{Math.round((100-((Products['pro-yearly'].priceRaw/Products['pro-monthly'].priceRaw)*100)))}% off!
                                    </span>
                                    </span>}
                            </p>

                            <div className="my-2">
                                {/* <p className="text-xs font-secondary text-gray-700">All for {this.state.checked && <span className="line-through">$20</span>}</p> */}
                                {productSelected.term == 'year' &&
                                    <div>
                                        <p className="text-sm text-gray-500 font-secondary"><span className="line-through font-normal">${Products['pro-monthly'].priceRaw * 12} / per year</span></p>
                                        {/* <p className="text-xs text-green-600 font-bold font-secondary uppercase mt-1">You save 25%</p> */}
                                    </div>
                                }
                                <h1 className="text-gray-900 text-base">
                                    <span className={`text-3xl text-gra-900 font-display leading-snug`}>{productSelected.term == 'year' ? Products['pro-yearly'].price : Products['pro-monthly'].price}</span>
                                    <span className={`font-normal font-display text-gray-900`}>&nbsp;/ {productSelected.term == 'year' ? 'per year' : 'per month'}</span></h1>
                            </div>

                            <div className="pb-3 border-t border-gray-100">
                                <ul className="pb-3 mt-3 text-sm list list-check leading-regular pl-6 text-gray-700">
                                    <li>Unlimited newsletters</li>
                                    <li>Access all templates</li>
                                    {/* <li>Image hosting</li> */}
                                </ul>
                                <p className="text-sm text-gray-700">Save hours with Smart Import, Adobe XD, and unlimited features.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
};

//stripeCreateCustomer is added to the graphql in stripeMutations.js
//(look for addGraphQLMutation('stripeCreateCustomer(email: String) : JSON');)
//the addGraphQLMutation 
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
    name: 'CheckoutPage',
    component: CheckoutPage,
    hocs: [withCurrentUser, withStripeElements,
        [withMutation, stripeCreateCustomer],
        [withMutation, stripeCreateSubscription],
        withRouter]
});