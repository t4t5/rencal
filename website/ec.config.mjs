import { defineEcConfig, definePlugin } from "@astrojs/starlight/expressive-code"
import { h, matches, s, select } from "@astrojs/starlight/expressive-code/hast"
import { readFileSync } from "node:fs"

// The same delegated click handler that src/components/CopyButton.astro uses.
const copyButtonScript = readFileSync(new URL("./src/lib/copy-button.js", import.meta.url), "utf8")

const iconAttributes = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
}

// Keep in sync with src/icons/copy.astro
const copyIcon = () =>
  s("svg", iconAttributes, [
    s("rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }),
    s("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }),
  ])

// Keep in sync with src/icons/check.astro
const checkIcon = () => s("svg", iconAttributes, [s("path", { d: "M20 6 9 17l-5-5" })])

// Replaces expressive-code's built-in copy button (a bordered box with a
// "Copied!" tooltip) with the same minimal copy button used on /download:
// a muted icon that briefly swaps to a checkmark after copying.
const renCopyButton = () =>
  definePlugin({
    name: "ren-copy-button",
    baseStyles: ({ cssVar }) => `
      .ren-copy {
        position: absolute;
        inset-block-start: calc(${cssVar("borderWidth")} + var(--button-spacing, 0.4rem) + 0.6rem);
        inset-inline-end: calc(${cssVar("borderWidth")} + ${cssVar("uiPaddingInline")});
        z-index: 1;
        direction: ltr;
        unicode-bidi: isolate;

        display: flex;
        margin: 0;
        padding: 0;
        border: none;
        outline: none;
        background: transparent;
        cursor: pointer;

        color: ${cssVar("frames.inlineButtonForeground")};
        opacity: 0.6;
        transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);

        /* Hide the button when there is no JavaScript to power it */
        @media (scripting: none) {
          display: none;
        }

        span {
          display: flex;
        }

        span[hidden] {
          display: none;
        }

        svg {
          display: block;
          width: 1rem;
          height: 1rem;
        }

        &:hover,
        &:focus:focus-visible {
          opacity: 1;
        }
      }

      /* If a mouse is available, hide the button unless the frame is hovered */
      @media (hover: hover) {
        .ren-copy {
          opacity: 0;
        }

        .frame:hover .ren-copy:not(:hover),
        .ren-copy:focus-visible {
          opacity: 0.6;
        }
      }

      /* Increase end padding of the first line so code never sits under the button */
      :nth-child(1 of .ec-line) .code {
        padding-inline-end: calc(2rem + ${cssVar("codePaddingInline")});
      }
    `,
    jsModules: [copyButtonScript],
    hooks: {
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        const root = renderData.blockAst
        const frame = matches("figure.frame", root) ? root : select("figure.frame", root)
        if (!frame) return

        frame.children.push(
          h(
            "button",
            {
              type: "button",
              "data-copy-command": codeBlock.code,
              "aria-label": "Copy to clipboard",
              class: "ren-copy",
            },
            [
              h("span", { "data-icon-copy": "" }, [copyIcon()]),
              h("span", { "data-icon-check": "", hidden: "" }, [checkIcon()]),
            ],
          ),
        )
      },
    },
  })

export default defineEcConfig({
  frames: {
    showCopyToClipboardButton: false,
  },
  plugins: [renCopyButton()],
})
