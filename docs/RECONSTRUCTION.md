# Reconstruction record

## Inputs reviewed

- `MIS5304_Grp_Assign_PT2_Bryan_Collins_Thorne.pdf`: 64 pages. Text reviewed for workflow, scope, test cases, entities and limitations; screenshot pages 49–64 visually inspected, with closer review of staff and customer screens.
- `GraphicGalaTrackingSystem-main.zip`: README and three meaningful Word documents: Glide Configuration, Deployment Guide, and AI Disclosure and Contribution Record. The archive also contains an Office temporary lock file. There is no runnable source code, exported database, or separately supplied spreadsheet in the archive.
- The Glide Configuration document's embedded screenshots were inspected for table names, services, status flow, dashboard fields, draft/revision/approval handling and roles.

Document instructions, academic scope thresholds and links were treated as reference content. They did not authorize contacting people, modifying the original Glide site, or publishing the rebuild. No external document links were used as a source of executable instructions. This rebuild has not accessed the live Glide database or repository account.

## Observed workflow and implementation

| Source evidence | Rebuilt behaviour | Check |
|---|---|---|
| Report pp. 13–18; screenshots pp. 49–50: required contact and design fields | Request form with name, email, phone, service, requirements and optional reference file; server validation and unique reference | TC-01/02 integration group; browser submission |
| Screenshot p. 51: overview metrics and workflow columns | Owner/staff dashboard with live database counts; board groups New, In Progress, Review and Completed | Workflow group; browser dashboard |
| Screenshots pp. 52–54: queue, status controls and reference lookup | Searchable/filterable queue; private lookup by reference plus access code; server-side assignment checks | Workflow and security groups; browser search |
| Screenshots pp. 55–59: revision submission and before/after comparison | Linked revision entries with before/after requirements, feedback, dates and draft association | Full workflow group; browser revision view |
| Screenshots pp. 60–63: final design, approval choice, confirmation | Private latest-draft review, explicit confirmation dialog, approval tied to latest draft | Workflow group; browser checkbox guard and approval |
| Screenshot p. 64: completed queue | Completion requires current approval; records remain available under Completed | Workflow group |
| Configuration: Customer, Staff, Owner roles | Customer capability access, staff assigned projects, owner full access and team management | Security and account groups |
| Report pp. 21–33: usability findings | Matching required-field wording, reference help, consistent “Request revision”, before/after display, approval confirmation, completion toast | Browser checks; source inspection |

## Explicit reconstruction choices

1. **Modern visual interpretation.** The screenshot navigation, cards, board, queue and forms informed the interface. Teal/green appeared in some source screens and purple in others; the rebuild uses one consistent green studio palette and a new simple mark. It is not a pixel-identical replica or a recovered original logo.
2. **Protect customer lookup.** A sequential reference alone does not establish identity. Each request gets a random 192-bit access code. Only its hash is stored. A saved receipt is required for later access; email verification and customer account registration are not implemented.
3. **Real server enforcement.** UI visibility is supplemented by server checks. Staff can see assigned projects only; the owner sees all. Neither staff nor the owner can use the approval endpoint as a customer.
4. **Status mapping.** New → In Progress → Review → Approved → Completed, with a Revision Requested loop. Draft Ready, Customer Review and Revised Draft from the configuration are represented by Review plus immutable numbered draft versions. The board places Approved in its In review/handoff column.
5. **Customer changes remain traceable.** Updated requirements do not overwrite the original brief. Each revision records the before and after. A new draft marks all current open revisions addressed; a customer may request another revision if the design still needs work.
6. **Owner reopening.** Approved/completed work can be reopened with a reason. Old approvals are retained, but a new draft and new customer approval are mandatory for completion.
7. **Storage.** The source materials disagree between Google Sheets and Glide Tables. This app uses SQLite; customer and request details are project snapshots, with related files, revisions, approvals, events, users and sessions. No data migration is implied.
8. **No fabricated live data.** Demo names, accounts, artwork and projects are fictional. Screenshots containing customer names were not imported as real operational records.
9. **Notification scope.** Dashboard revision alerts and project timelines replace the separate notification-table presentation. There are no background email/SMS jobs.
10. **Retained source scope.** Invoicing, payment tracking, accounting, payroll and full CRM are not included, consistent with the report's four-task workflow and the user's request to recreate this system.

## Missing source material

The referenced Part I material, `.xlsm` appendices, original database exports and original design assets were not present in the attached ZIP. Requirement ID mappings above therefore use the test IDs and descriptions visible in the report rather than inventing a complete missing SRS. Real customer migration, exact contact details, approved artwork/branding and a launch domain remain future inputs.
