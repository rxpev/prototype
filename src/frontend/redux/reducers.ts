/**
 * Configures the state reducers.
 *
 * @module
 */
import { keyBy, merge, values, xorBy } from "lodash";
import { ReduxActions } from "./actions";
import { AppAction, AppState, InitialState } from "./state";

/** --- Simple reducers --- */

function appInfo(state = InitialState.appInfo, action: AppAction) {
  return action.type === ReduxActions.APP_INFO_UPDATE
    ? action.payload
    : state;
}

function appStatus(state = InitialState.appStatus, action: AppAction) {
  return action.type === ReduxActions.APP_STATUS_UPDATE
    ? action.payload
    : state;
}

function continents(state = InitialState.continents, action: AppAction) {
  return action.type === ReduxActions.CONTINENTS_UPDATE
    ? action.payload
    : state;
}

function emails(state = InitialState.emails, action: AppAction) {
  switch (action.type) {
    case ReduxActions.EMAILS_DELETE:
      return xorBy(state, action.payload, "id");

    case ReduxActions.EMAILS_UPDATE:
      return values(merge(keyBy(state, "id"), keyBy(action.payload, "id")))
        .sort((a: any, b: any) => b.sentAt.valueOf() - a.sentAt.valueOf())
        .map((email: any) => {
          email.dialogues.sort(
            (a: any, b: any) => b.sentAt.valueOf() - a.sentAt.valueOf()
          );
          return email;
        });

    default:
      return state;
  }
}

function locale(state = InitialState.locale, action: AppAction) {
  return action.type === ReduxActions.LOCALE_UPDATE
    ? action.payload
    : state;
}

function playing(state = InitialState.playing, action: AppAction) {
  return action.type === ReduxActions.PLAYING_UPDATE
    ? action.payload
    : state;
}

function profile(state = InitialState.profile, action: AppAction) {
  return action.type === ReduxActions.PROFILE_UPDATE
    ? action.payload
    : state;
}

function profiles(state = InitialState.profiles, action: AppAction) {
  switch (action.type) {
    case ReduxActions.PROFILES_DELETE:
      return state.filter((p) => p.id !== action.payload[0].id);

    case ReduxActions.PROFILES_UPDATE:
      return action.payload;

    default:
      return state;
  }
}

function shortlist(state = InitialState.shortlist, action: AppAction) {
  return action.type === ReduxActions.SHORTLIST_UPDATE
    ? action.payload
    : state;
}

function windowData(state = InitialState.windowData, action: AppAction) {
  return action.type === ReduxActions.WINDOW_DATA_UPDATE
    ? merge({}, state, action.payload)
    : state;
}

function working(state = InitialState.working, action: AppAction) {
  return action.type === ReduxActions.WORKING_UPDATE
    ? action.payload
    : state;
}

/** ---------------------------- */
/** FACEIT REDUCERS */
/** ---------------------------- */

function faceitMatchRoom(
  state = InitialState.faceitMatchRoom,
  action: AppAction
) {
  switch (action.type) {
    case ReduxActions.FACEIT_ROOM_SET:
      return action.payload.room;

    case ReduxActions.FACEIT_ROOM_CLEAR:
      return null;

    default:
      return state;
  }
}

function faceitMatchId(
  state = InitialState.faceitMatchId,
  action: AppAction
) {
  switch (action.type) {
    case ReduxActions.FACEIT_ROOM_SET:
      return action.payload.matchId ?? null;

    case ReduxActions.FACEIT_ROOM_CLEAR:
      return null;

    default:
      return state;
  }
}

function faceitMatchCompleted(
  state = InitialState.faceitMatchCompleted,
  action: AppAction
) {
  switch (action.type) {
    case ReduxActions.FACEIT_MATCH_COMPLETED:
      return true;

    case ReduxActions.FACEIT_ROOM_CLEAR:
      return false;

    default:
      return state;
  }
}

/** ---------------------------- */
/** ROOT REDUCER */
/** ---------------------------- */

export default function reducer(state: AppState, action: AppAction) {
  return {
    appInfo: appInfo(state.appInfo, action),
    appStatus: appStatus(state.appStatus, action),
    continents: continents(state.continents, action),
    emails: emails(state.emails, action),
    locale: locale(state.locale, action),
    playing: playing(state.playing, action),
    profile: profile(state.profile, action),
    profiles: profiles(state.profiles, action),
    shortlist: shortlist(state.shortlist, action),
    windowData: windowData(state.windowData, action),
    working: working(state.working, action),

    /** FACEIT */
    faceitMatchRoom: faceitMatchRoom(state.faceitMatchRoom, action),
    faceitMatchId: faceitMatchId(state.faceitMatchId, action),
    faceitMatchCompleted: faceitMatchCompleted(
      state.faceitMatchCompleted,
      action
    ),
  };
}
