import React from 'react';
import { registerComponent, Components } from 'meteor/vulcan:lib';

// import { Link } from 'react-router-dom';
// const AssociatedDocument = ({ document }) => {
//   <Link to={document.pageUrl}>{document._id}</Link>
// }

const StripeId = ({ document }) => 
  <a href={document.stripeChargeUrl} target="_blank" rel="noopener noreferrer">{document.stripeId}</a>;
const InvoiceId = ({ document }) => 
  <a href={document.latestInvoiceUrl} target="_blank" rel="noopener noreferrer">{document.latest_invoice}</a>;

const ChargesDashboard = props =>
  <div className="charges">
    <Components.Datatable
      showSearch={false}
      showEdit={true}
      showNew={false}
      collectionName="Charges"
      options={{
        fragmentName: 'ChargeFragment'
      }}
      columns={[
        {
          name: 'createdAtFormattedShort',
          label: 'Created At',
        },
        'user',
        'amount',
        'type',
        'source',
        'productKey',
        'test',
        'associatedDocument',
        'status',
        {
          name: 'stripeId',
          component: StripeId
        },
        {
          name:'latest_invoice',
          component:InvoiceId
        }
      ]}
    />
  </div>;

registerComponent('ChargesDashboard', ChargesDashboard);