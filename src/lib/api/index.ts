import { events } from "@/lib/api/calendar-events"
import { calendars } from "@/lib/api/calendars"
import { contacts } from "@/lib/api/contacts"
import { notifications } from "@/lib/api/notifications"
import { plugins } from "@/lib/api/plugins"
import { providers } from "@/lib/api/providers"
import { settings } from "@/lib/api/settings"
import { sync } from "@/lib/api/sync"
import { themes } from "@/lib/api/themes"

export const api = {
  events,
  calendars,
  contacts,
  providers,
  sync,
  settings,
  themes,
  notifications,
  plugins,
} as const

export type AppApi = typeof api

export type {
  CreateEventParams,
  EventRange,
  EventRef,
  ListEventsParams,
  ListInvitesParams,
  SearchEventsParams,
} from "@/lib/api/calendar-events"
export type { Calendar } from "@/lib/api/calendars"
export type { Contact } from "@/lib/api/contacts"
export { getErrorMessage, isRenCalError, type RenCalError } from "@/lib/api/errors"
export type { NotificationSubscription } from "@/lib/api/notifications"
export type {
  InstalledPlugin,
  InstalledPlugins,
  PluginCatalog,
  PluginCatalogEntry,
  PluginFontInspection,
  PluginInspection,
  PluginInstallLink,
  PluginThemeInspection,
} from "@/lib/api/plugins"
export type { CredentialFieldInput, ProviderField } from "@/lib/api/providers"
export type { CaldirSettings } from "@/lib/api/settings"
export type { SyncPreview } from "@/lib/api/sync"
export type {
  ExternalTheme,
  ExternalThemeError,
  ExternalThemeFont,
  ExternalThemeFonts,
  ExternalThemesSnapshot,
  FontStyle,
  OmarchyColors,
} from "@/lib/api/themes"
export type { CalendarEvent, EventAttendee, Recurrence, ResponseStatus } from "@/lib/cal-events"
export type { EventConference } from "@/lib/conference"
export type { EventTime, FirstDayOfWeek, TimeFormat } from "@/lib/event-time"
