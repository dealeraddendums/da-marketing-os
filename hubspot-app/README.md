# Steven Chat Bridge — HubSpot app project

The HubSpot side of the live-chat hand-off (docs/chat-hubspot-bridge.md). A
project-based OAuth app on HubSpot's 2026.09 developer platform, privately
distributed to our own portal (23896347). It exists only to hold the OAuth
grant and the Custom Channel; all code runs in da-marketing-os.

    npm i -g @hubspot/cli          # >= 7.6.0
    hs account auth                # personal access key from portal 23896347
    cd hubspot-app && hs project validate && hs project upload

`uid` values must never change after the first upload — HubSpot keys the app
on them, and a changed uid creates a second app.
