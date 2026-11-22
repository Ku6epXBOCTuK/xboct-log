# Plans screen mockup

Open `plans-screen.html` in a browser for the full-size mockup, or view `plans-screen.svg` / `plans-screen.png` inline in GitHub. `plans-screen.fig` is the native OpenPencil document.

The mockup uses the values from `ui-kit/tokens/tool.css` (tool theme): same spacing scale, colours, radii and type steps as the app. It covers the plan list, task cards with blocked and closed states, a separate task search, document cards as links, and the removal confirmation.

Regenerate the native file and previews after editing the HTML:

```sh
openpencil import docs/design/plans-screen.html -o docs/design/plans-screen.fig -f fig
openpencil export docs/design/plans-screen.fig -o docs/design/plans-screen.svg -f svg
openpencil export docs/design/plans-screen.fig -o docs/design/plans-screen.png -f png
```
