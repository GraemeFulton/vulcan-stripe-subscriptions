import { registerFragment } from 'meteor/vulcan:core';

registerFragment(`
  fragment ChargeFragment on Charge {
    _id
    createdAt
    createdAtFormatted
    createdAtFormattedShort
    user{
      _id
      slug
      username
      displayName
      pageUrl
      pagePath
      emailHash
      avatarUrl
    }
    type
    source
    productKey
    test
    associatedCollection
    associatedDocument

    # doesn't work with unions, maybe try interface?
    # associatedDocument{
    #   _id
    #  pageUrl
    # }

    amount
    properties
    stripeId
    stripeChargeUrl
    status
    current_period_end
    latest_invoice
    latestInvoiceUrl
  }
`);