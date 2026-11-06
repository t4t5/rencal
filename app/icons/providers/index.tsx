/* Provider marks keep their own colors. */
import { Image, type ImageAsset, type JSX } from "nsh"

import appleIconSvg from "./apple.svg"
import etesyncIconSvg from "./etesync.svg"
import googleIconSvg from "./google.svg"
import microsoftIconSvg from "./microsoft.svg"

type Source = ImageAsset

const mark =
  (source: Source) =>
  (props: { class?: string }): JSX.Element => (
    <Image src={source} class={`size-4 ${props.class ?? ""}`} />
  )

export const AppleIcon = mark(appleIconSvg)
export const EtesyncIcon = mark(etesyncIconSvg)
export const GoogleIcon = mark(googleIconSvg)
export const MicrosoftIcon = mark(microsoftIconSvg)
