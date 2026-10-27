# Export requisition list to CSV

Employers want to download their requisition list (with status and fill counts) as CSV from the employer console. Currently only possible via account manager.

Scope
The export endpoint in the export service: the console's backend POSTs the employer's requisitions to it and streams the answer to the browser as the download. The download button is a separate task.

(Adapted 2026-10-27 from the archive's csv-export ticket, double-blind-experiment/specs/csv-export/ticket.md, whose scope was a CSV builder function, for independent-tests Phase 6: the same request served at an HTTP boundary.)
