import { addRoute } from 'meteor/vulcan:core';

addRoute([

  {name:'chargesDashboard', path: '/charges', componentName: 'ChargesDashboard', layoutName: 'AdminLayout'},
  // {name:'CheckoutPageTest', path: '/checkout-test', componentName: 'CheckoutPage'},
  //checkout page
  {name:'checkoutPage', path: '/checkout', componentName: 'CheckoutPage'},
]);
