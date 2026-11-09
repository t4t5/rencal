/* Generated once from `src/icons`; each SVG draws in one color, tinted to the text it sits with. */
import { Image, type ImageAsset, type JSX, token } from "nsh"

import agentIconSvg from "./svg/agent.svg"
import arrowRightIconSvg from "./svg/arrow-right.svg"
import arrowUpRightIconSvg from "./svg/arrow-up-right.svg"
import bellIconSvg from "./svg/bell.svg"
import calendarIconSvg from "./svg/calendar.svg"
import checkIconSvg from "./svg/check.svg"
import chevronDownIconSvg from "./svg/chevron-down.svg"
import chevronLeftIconSvg from "./svg/chevron-left.svg"
import chevronRightIconSvg from "./svg/chevron-right.svg"
import chevronUpIconSvg from "./svg/chevron-up.svg"
import circleIconSvg from "./svg/circle.svg"
import clockIconSvg from "./svg/clock.svg"
import closeIconSvg from "./svg/close.svg"
import cloudCheckIconSvg from "./svg/cloud-check.svg"
import cloudOffIconSvg from "./svg/cloud-off.svg"
import cloudWarningIconSvg from "./svg/cloud-warning.svg"
import cloudIconSvg from "./svg/cloud.svg"
import eyeClosedIconSvg from "./svg/eye-closed.svg"
import eyeIconSvg from "./svg/eye.svg"
import globeIconSvg from "./svg/globe.svg"
import googleMeetIconSvg from "./svg/google-meet.svg"
import keyboardIconSvg from "./svg/keyboard.svg"
import linkIconSvg from "./svg/link.svg"
import moreHorizIconSvg from "./svg/more-horiz.svg"
import paletteIconSvg from "./svg/palette.svg"
import pluginIconSvg from "./svg/plugin.svg"
import plusIconSvg from "./svg/plus.svg"
import pushpinIconSvg from "./svg/pushpin.svg"
import questionMarkCircleIconSvg from "./svg/question-mark-circle.svg"
import questionMarkIconSvg from "./svg/question-mark.svg"
import rencalLogomarkIconSvg from "./svg/rencal-logomark.svg"
import repeatIconSvg from "./svg/repeat.svg"
import rssIconSvg from "./svg/rss.svg"
import searchIconSvg from "./svg/search.svg"
import settingsIconSvg from "./svg/settings.svg"
import sidebarIconSvg from "./svg/sidebar.svg"
import syncIconSvg from "./svg/sync.svg"
import undoIconSvg from "./svg/undo.svg"
import userIconSvg from "./svg/user.svg"
import videoIconSvg from "./svg/video.svg"

type IconProps = { class?: string; color?: string }
type Source = ImageAsset

const icon =
  (source: Source) =>
  (props: IconProps): JSX.Element => (
    <Image
      src={source}
      class={`size-4 ${props.class ?? ""}`}
      // Images cover their box by default, which crops the wider SVGs (the clouds).
      style={{ objectFit: "contain", tintColor: props.color ?? token("foreground") }}
    />
  )

export const AgentIcon = icon(agentIconSvg)
export const ArrowRightIcon = icon(arrowRightIconSvg)
export const ArrowUpRightIcon = icon(arrowUpRightIconSvg)
export const BellIcon = icon(bellIconSvg)
export const CalendarIcon = icon(calendarIconSvg)
export const CheckIcon = icon(checkIconSvg)
export const ChevronDownIcon = icon(chevronDownIconSvg)
export const ChevronLeftIcon = icon(chevronLeftIconSvg)
export const ChevronRightIcon = icon(chevronRightIconSvg)
export const ChevronUpIcon = icon(chevronUpIconSvg)
export const CircleIcon = icon(circleIconSvg)
export const ClockIcon = icon(clockIconSvg)
export const CloseIcon = icon(closeIconSvg)
export const CloudCheckIcon = icon(cloudCheckIconSvg)
export const CloudOffIcon = icon(cloudOffIconSvg)
export const CloudWarningIcon = icon(cloudWarningIconSvg)
export const CloudIcon = icon(cloudIconSvg)
export const EyeClosedIcon = icon(eyeClosedIconSvg)
export const EyeIcon = icon(eyeIconSvg)
export const GlobeIcon = icon(globeIconSvg)
export const GoogleMeetIcon = icon(googleMeetIconSvg)
export const KeyboardIcon = icon(keyboardIconSvg)
export const LinkIcon = icon(linkIconSvg)
export const MoreHorizIcon = icon(moreHorizIconSvg)
export const PaletteIcon = icon(paletteIconSvg)
export const PluginIcon = icon(pluginIconSvg)
export const PlusIcon = icon(plusIconSvg)
export const PushpinIcon = icon(pushpinIconSvg)
export const QuestionMarkCircleIcon = icon(questionMarkCircleIconSvg)
export const QuestionMarkIcon = icon(questionMarkIconSvg)
export const RencalLogomarkIcon = icon(rencalLogomarkIconSvg)
export const RepeatIcon = icon(repeatIconSvg)
export const RssIcon = icon(rssIconSvg)
export const SearchIcon = icon(searchIconSvg)
export const SettingsIcon = icon(settingsIconSvg)
export const SidebarIcon = icon(sidebarIconSvg)
export const SyncIcon = icon(syncIconSvg)
export const UndoIcon = icon(undoIconSvg)
export const UserIcon = icon(userIconSvg)
export const VideoIcon = icon(videoIconSvg)
