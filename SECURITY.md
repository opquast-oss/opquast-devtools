# Security

Please do not open a public issue for a security problem. Write to **contact@opquast.com** with
"Opquast DevTools — security" in the subject, a description of the issue and, if you can, the
steps to reproduce it. We will answer and keep you informed until it is fixed.

The extension runs code in the pages you inspect and fetches the resources they reference — with
your browser's credentials for the page's own origin, without them elsewhere, without following
redirects, and never at a local-network address named by a public page (see
[`PRIVACY.md`](PRIVACY.md#network-activity)). Issues of
particular interest are therefore: a page that can make the extension run its
code or reach data it should not, data leaving the device, and the permissions requested
(see [`PERMISSIONS.md`](PERMISSIONS.md)).
