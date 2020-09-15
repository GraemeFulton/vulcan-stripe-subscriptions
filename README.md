# Vulcan Stripe Subscriptions

This package manages Stripe subscriptions in Vulcan. It only handles fixed price subscriptions using [Stripe Elements](https://stripe.com/docs/billing/subscriptions/fixed-price).

The starting point of this package is the [original `vulcan-payments` package](https://github.com/VulcanJS/Vulcan/blob/devel/packages/vulcan-payments/README.md), so uses the same `Charges` collection. Therefore, there are likely to be conflicts if you use them both together. 

<img src="https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/readme/stripe-elements-leader.png" width="600"/>

## 1. Set up Stripe
* This is a port of the [fixed price Stripe example](https://stripe.com/docs/billing/subscriptions/fixed-price) into Vulcan.
* This package doesn't yet handle inserting products. You must add them manually. See below:

### Add your subscription products
Add your products from the Stripe dashboard, or using the Stripe CLI client. 
Using the CLI package can be faster, here's how in 3 steps:

1.  Install the Stripe client of: `npm install --save stripe` - Make sure it's the latest version (8.79.0 or above). Check your package.json in case!

2. Add your products using Stripe CLI. Paste service products into your terminal:
`
stripe products create \
  --name="Letter Pro" \
  --type=service \
  --description="Unlimited letters and components."
`

3. Add the subscription service tiers/prices using the productId that is returned from the above command.
For example, if you have monthly and annual pricing, here's how you'd add both prices to the same product:

* Add Monthly at $20 per month
`
stripe prices create \
  -d product=prod_Hhv922zP2fFoHs \
  -d unit_amount=2000 \
  -d currency=usd \
  -d "recurring[interval]"=month
`
* Add yearly at $15 per month, billed annually
To add a yearly option, create a new price, using the same product ID, and set the interval to year.
E.g. here I set the unit amount to $15
`
stripe prices create \
  -d product=prod_Hhv922zP2fFoHs \
  -d unit_amount=1500 \
  -d currency=usd \
  -d "recurring[interval]"=year
`

## 2. Add your Subscription products to Vulcan
In your project, add a `products.js`, and use `addSubscriptionProduct` from `meteor/vulcan:stripe-subscriptions` to add the subscription products from step 1. These are for vulcan to know about your products. Here's an example following on from the previous step:

```
import { addSubscriptionProduct } from 'meteor/vulcan:stripe-subscriptions';

addSubscriptionProduct(
  'pro-yearly',
    {
        apiId: 'price_1H9xrbHdc8hnogUr6R9uDO6j',
        name: 'Letter Pro',
        price: '$180.00',
        term:'year'
    }
);
addSubscriptionProduct(
  'pro-monthly',
    {
        apiId: 'price_1H9xrbHdc8hnogUrkRWK8b6f',
        name: 'Letter Pro',
        price: '$20.00',
        term:'month'
    }
);
```
The apiId can be found in your Stripe dashboard (https://dashboard.stripe.com/test/products/), it looks like this:
![Product dashboard](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/readme/Screenshot%202020-08-03%20at%2011.30.59.png)

Now you should be set up, here's are components to add the checkout to your project:

## 3. Components

### 1. CheckoutModal
Shows a checkout button - when clicked, a modal with the checkout form is displayed:
<img src="https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/readme/Screenshot%202020-08-03%20at%2011.08.01.png" width="500"/>
```
<Components.CheckoutModal
    vulcanProductKey={this.state.checked ? "pro-yearly" : 'pro-monthly'}
    buttonText="Get Pro"
    associatedCollection={'Users'}
    associatedDocument={currentUser._id}
    fragmentName="UserSetAsPaid"
    fragment={gql`
              fragment UserSetAsPaid on User {
                  _id
                  status
                  paidAt
              }
              `}
/>
```

#### Props
* *vulcanProductKey*: This is Vulcan's identifier of the Stripe product. It's the name provided as the first argument to `addSubscriptionProduct` in step 2.
* *buttonText*: custom button text
* *associatedCollection*: this must be the String name of your collection   
* *associatedDocument*: this must be the String ID of the document you want to associate with the subscription   

The expanded modal displays the Stripe checkout using Stripe elements:
<img src="https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/readme/Screenshot%202020-08-03%20at%2011.41.50.png" width="500"/>

This is bare bones, but with Stripe Elements, you can customise the look and feel so that it looks native to your app. See [examples here](https://stripe.dev/elements-examples/).  

# User Groups and Permissions
When a payment is successful, that user is added to the `paidMembers` group (created [here](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/lib/modules/charges/groups.js)).

When restricting premium content, check if the user is part of the `paidMembers` group:

```
if(Users.isMemberOf(currentUser, 'paidMembers')){
//member only stuff
}
```

## Handling Expired Subscriptions  
When a subscription is cancelled, the user is not removed from the `paidMembers` group. This is because users should keep access to premium services until the end of the period they have paid for.

To handle this, an extra function is provided: `isSubscriptionActive`:
* It checks [if the current date exceeds the subscription end date](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/89f6f326a9bbed07fff734ae98884fe12253afac/lib/server/mutations.js#L141). 
* At that point, [status of the subscription is set to expired](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/89f6f326a9bbed07fff734ae98884fe12253afac/lib/server/mutations.js#L159).
* Once the subscription status is updated, the [Charges collection callback](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/lib/modules/charges/collection.js#L24) runs, and [removes the user](https://github.com/GraemeFulton/vulcan-stripe-subscriptions/blob/master/lib/modules/charges/callbacks.js#L48) from `paidMembers`.

### isSubscriptionActive()
This should be used when the user logs in, or whenever you need to check if a user's subscription should be terminated (e.g. cancelled).
`isSubscriptionActive` is an async function, here's how to add it to your vulcan component:

1. Make sure you import `withMutation`
```
import { withMutation} from "meteor/vulcan:core";
```
2. Define the mutation at the bottom of your component, just like this:
```
const isSubscriptionActive = {
  name: 'isSubscriptionActive',
  args: { userId: 'String' }
};
```
3. When registering your component, add it as a HoC:
```
registerComponent({
  name: "ComponentName",
  component: Component,
  hocs: [[withMutation,isSubscriptionActive ]]
});
```
Now `this.props.isSubscriptionActive()` is available to call from within your component. e.g.:
```
//check if the subscription is active
var subscriptionActive = await this.props.isSubscriptionActive()
//returns true or false, and updates the user group if necessary.   
   
if(subscriptionActive && Users.isMemberOf(this.props.currentUser, 'paidMembers')){
    
}
```

# Readme TODO

* Add all checkout component examples
* Add issues/things to improve
