'use client';

export default function PolicyOverview() {
  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          North Carolina Stein FY2026-27 Tax Proposals
        </h2>
        <p className="text-gray-700 mb-4">
          Governor Josh Stein&apos;s FY2026-27 Recommended Budget includes four
          household-level tax provisions modeled on this dashboard. The proposals
          would maintain North Carolina&apos;s 3.99% individual income tax rate
          (repealing triggered rate reductions that would otherwise drop the rate
          to 3.49% in 2027 and 2.99% in 2028), raise the standard deduction,
          and create two new refundable state tax credits modeled on federal
          programs. Impacts are shown as the Stein reform relative to expected
          current law (which reflects the triggered rate cuts): positive numbers
          mean the household gains net income, and negative numbers mean the
          household pays more or that the state incurs revenue cost.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Maintain 3.99% income tax rate
            </h3>
            <p className="text-sm text-gray-600">
              Repeals the triggered rate reductions in current law that would
              otherwise drop North Carolina&apos;s individual income tax rate
              to 3.49% in 2027 and 2.99% in 2028.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Raise the standard deduction (2027)
            </h3>
            <p className="text-sm text-gray-600">
              Increases the standard deduction starting in 2027 by $1,000 for
              joint / surviving spouse filers (to $26,500), $750 for head of
              household (to $19,875), and $500 for single / married filing
              separately (to $13,250).
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Working Families Tax Credit (2026)
            </h3>
            <p className="text-sm text-gray-600">
              Creates a refundable state Working Families Tax Credit equal to
              10% of the federal Earned Income Tax Credit, starting in tax
              year 2026.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">
              Child and Dependent Care Credit (2026)
            </h3>
            <p className="text-sm text-gray-600">
              Creates a refundable state Child and Dependent Care Tax Credit
              equal to 30% of the federal Child and Dependent Care Credit,
              starting in tax year 2026.
            </p>
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <h3 className="font-semibold text-yellow-900 mb-2">
            Provisions not modeled
          </h3>
          <p className="text-sm text-yellow-900 mb-2">
            Two provisions in Governor Stein&apos;s FY2026-27 tax package are
            not included in this analysis because PolicyEngine-US does not
            currently model them:
          </p>
          <ul className="list-disc pl-5 text-sm text-yellow-900 space-y-1">
            <li>
              <strong>Sales Tax Back-to-School Holiday</strong> &mdash; not
              modeled because PolicyEngine-US does not cover North Carolina
              sales tax.
            </li>
            <li>
              <strong>Maintenance of the 2% corporate income tax rate</strong>
              &nbsp;&mdash; not modeled because PolicyEngine-US does not cover
              corporate income tax.
            </li>
          </ul>
        </div>
      </div>

      {/* Parameter changes table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Parameter changes (Stein reform vs. expected current law)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Parameter</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Expected current law</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Stein reform</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Individual income tax rate (2027)</td>
                <td className="py-3 px-4 text-right text-gray-700">3.49%</td>
                <td className="py-3 px-4 text-right text-gray-700">3.99%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">+0.50 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Individual income tax rate (2028)</td>
                <td className="py-3 px-4 text-right text-gray-700">2.99%</td>
                <td className="py-3 px-4 text-right text-gray-700">3.99%</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">+1.00 pp</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Standard deduction &mdash; joint / surviving spouse (2027)</td>
                <td className="py-3 px-4 text-right text-gray-700">$25,500</td>
                <td className="py-3 px-4 text-right text-gray-700">$26,500</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">+$1,000</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Standard deduction &mdash; head of household (2027)</td>
                <td className="py-3 px-4 text-right text-gray-700">$19,125</td>
                <td className="py-3 px-4 text-right text-gray-700">$19,875</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">+$750</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Standard deduction &mdash; single / married filing separately (2027)</td>
                <td className="py-3 px-4 text-right text-gray-700">$12,750</td>
                <td className="py-3 px-4 text-right text-gray-700">$13,250</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">+$500</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Working Families Tax Credit (2026+)</td>
                <td className="py-3 px-4 text-right text-gray-700">None</td>
                <td className="py-3 px-4 text-right text-gray-700">10% of federal EITC</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">New refundable credit</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">Child and Dependent Care Credit (2026+)</td>
                <td className="py-3 px-4 text-right text-gray-700">None</td>
                <td className="py-3 px-4 text-right text-gray-700">30% of federal CDCC</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">New refundable credit</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* References and further reading */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          References
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              Governor Stein&apos;s FY2026-27 Recommended Budget
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://www.osbm.nc.gov/fy2026-27-budget-rec-budget-book/open#page=69"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  North Carolina Office of State Budget and Management &mdash; FY2026-27 Recommended Budget (tax proposals, page 69)
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
