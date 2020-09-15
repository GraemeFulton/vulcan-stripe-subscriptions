import moment from 'moment';

const schema = {

  // default properties

  _id: {
    type: String,
    optional: true,
    canRead: ['guests'],
  },
  createdAt: {
    type: Date,
    optional: true,
    canRead: ['admins', 'members'],
    onCreate: () => {
      return new Date();
    },
  },
  userId: {
    type: String,
    optional: true,
    canRead: ['admins'],
    resolveAs: {
      fieldName: 'user',
      type: 'User',
      resolver: async (post, args, { currentUser, Users }) => {
        const user = await Users.loader.load(post.userId);
        return Users.restrictViewableFields(currentUser, Users, user);
      },
      addOriginalField: true
    },
  },

  // custom properties

  type: {
    type: String,
    optional: true,
    canRead: ['admins'],
  },

  associatedCollection: {
    type: String,
    canRead: ['admins'],
    optional: true,
  },

  associatedDocument: {
    type: String,
    canRead: ['admins'],
    optional: true,
  },

  tokenId: {
    type: String,
    optional: true,
  },

  productKey: {
    type: String,
    canRead: ['admins'],
    optional: true,
  },

  source: {
    type: String,
    canRead: ['admins'],
    optional: true,
  },

  test: {
    type: Boolean,
    canRead: ['admins'],
    optional: true,
  },

  data: {
    type: String,
    // canRead: ['admins'], // for security's sake don't expose this through GraphQL API
    blackbox: true,
  },

  properties: {
    type: Object,
    canRead: ['admins'],
    blackbox: true,
  },

  ip: {
    type: String,
    canRead: ['admins'],
    optional: true,
  },

  // GraphQL only
  amount: {
    type: Number,
    optional: true,
    canRead: ['admins'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: charge => {
    //     if(charge.data && charge.data.plan)
    //     return '$'+(charge.data.plan.amount/100)},
    // }
  },
  // cancel_at: {
  //   type: String,
  //   optional: true,
  //   canRead: ['admins'],
  //   resolveAs: {
  //     type: 'String',
  //     resolver: charge => charge.cancel_at,
  //   }
  // },
  current_period_end: {
    type: String,
    optional: true,
    canRead: ['admins', 'members'],
  },
  latest_invoice: {
    type: String,
    optional: true,
    canRead: ['admins', 'members'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: charge => charge.data.latest_invoice,
    // }
  },
  latestInvoiceUrl: {
    type: String,
    optional: true,
    canRead: ['admins'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: (charge, args, context) => {
    //     // return `https://dashboard.stripe.com/test/invoices/${charge.data.latest_invoice}`;
    //     return `https://dashboard.stripe.com/test/invoices/${charge.latest_invoice}`;
    //   }
    // }
  },
  createdAtFormatted: {
    type: String,
    optional: true,
    canRead: ['admins'],
    resolveAs: {
      type: 'String',
      resolver: (charge, args, context) => {
        return moment(charge.createdAt).format('dddd, MMMM Do YYYY');
      }
    }
  },

  createdAtFormattedShort: {
    type: String,
    optional: true,
    canRead: ['admins'],
    resolveAs: {
      type: 'String',
      resolver: (charge, args, context) => {
        return moment(charge.createdAt).format('YYYY/MM/DD, hh:mm');
      }
    }
  },

  stripeId: {
    type: String,
    optional: true,
    canRead: ['admins'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: (charge, args, context) => {
    //     return charge && charge._id;
    //   }
    // }
  },

  stripeChargeUrl: {
    type: String,
    optional: true,
    canRead: ['admins'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: (charge, args, context) => {
    //     // return `https://dashboard.stripe.com/test/subscriptions/${charge.data.id}`;
    //     return `https://dashboard.stripe.com/test/subscriptions/${charge.id}`;
    //   }
    // }
  },
  status: {
    type: String,
    optional: true,
    canRead: ['admins', 'members'],
    // resolveAs: {
    //   type: 'String',
    //   resolver: (charge, args, context) => {
    //     // return `https://dashboard.stripe.com/test/subscriptions/${charge.data.id}`;
    //     return `https://dashboard.stripe.com/test/subscriptions/${charge.id}`;
    //   }
    // }
  },

  // doesn't work yet

  // associatedDocument: {
  //   type: Object,
  //   canRead: ['admins'],
  //   optional: true,
  //   resolveAs: {
  //     type: 'Chargeable',
  //     resolver: (charge, args, context) => {
  //       const collection = getCollection(charge.associatedCollection);
  //       return collection.loader.load(charge.associatedId);
  //     }
  //   } 
  // },

};

export default schema;
