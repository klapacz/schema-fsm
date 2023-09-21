import { z } from "zod";

type States = Record<string, z.ZodObject<{}>>;

type Transition<
  TStates extends States,
  TName extends string = any,
  TFrom extends keyof TStates = any,
  TTo extends keyof TStates = any,
  TPayload = any,
> = {
  name: TName;
  from: TFrom;
  to: TTo;
  action: (
    state: z.infer<TStates[TFrom]>,
    payload: TPayload,
  ) => Promise<z.infer<TStates[TTo]>>;
};

type AnyFSMState<
  TStates extends States,
  TTransitions extends Transition<TStates>[],
> = {
  [T in keyof TStates]: FSMState<TStates, TTransitions, T>;
}[keyof TStates];

type FSMState<
  TStates extends States,
  TTransitions extends Transition<TStates>[],
  TCurrentState extends keyof TStates,
  TAvailableTransitions extends Transition<TStates> = Extract<
    TTransitions[number],
    { from: TCurrentState }
  >,
> = {
  state: TCurrentState;
  data: z.infer<TStates[TCurrentState]>;
  execute<
    TTransitionName extends TAvailableTransitions["name"],
    TTransition extends Transition<TStates> = Extract<
      TAvailableTransitions,
      { name: TTransitionName }
    >,
    TPayload = TTransition extends Transition<
      TStates,
      infer TName,
      infer TFrom,
      infer TTo,
      infer TPayload
    >
      ? TPayload
      : never,
  >(
    name: TTransitionName,
    payload: TPayload,
  ): Promise<FSMState<TStates, TTransitions, TTransition["to"]>>;
};

type FSM<TStates extends States, TTransitions extends Transition<TStates>[]> = {
  addTransition: <
    TName extends string,
    TFrom extends keyof TStates,
    TTo extends keyof TStates,
    TPayload = any,
  >(params: {
    name: TName;
    from: TFrom;
    to: TTo;
    action: (
      state: z.infer<TStates[TFrom]>,
      payload: TPayload,
    ) => Promise<z.infer<TStates[TTo]>>;
  }) => FSM<
    TStates,
    [...TTransitions, Transition<TStates, TName, TFrom, TTo, TPayload>]
  >;

  parse: <TInput extends { state: string }>(
    input: TInput,
  ) => AnyFSMState<TStates, TTransitions>;
  parseState: <TState extends keyof TStates, TInput extends { state: TState }>(
    state: TState,
    input: TInput,
  ) => FSMState<TStates, TTransitions, TState>;
};

function createFSMState<
  TStates extends States,
  TTransitions extends Transition<TStates>[],
  TCurrentState extends keyof TStates,
>(params: {
  states: TStates;
  transitions: TTransitions;
  state: TCurrentState;
  data: z.infer<TStates[TCurrentState]>;
}): FSMState<TStates, TTransitions, TCurrentState> {
  return {
    state: params.state,
    data: params.data,

    async execute(name, payload) {
      const transition = params.transitions.find(
        (t) => t.from === params.state && t.name === name,
      );
      if (!transition) {
        throw new Error(`Unknown transition: ${name}`);
      }

      const result = await transition.action(params.data, payload);
      const schema = params.states[transition.to];

      const data = schema.parse(result);

      return createFSMState({
        states: params.states,
        transitions: params.transitions,
        state: transition.to,
        data,
      });
    },
  };
}

function createFSMDefinition<
  TStates extends States,
  TTransitions extends Transition<TStates>[],
>(params: {
  states: TStates;
  transitions: TTransitions;
}): FSM<TStates, TTransitions> {
  return {
    addTransition(newTransition) {
      return createFSMDefinition({
        states: params.states,
        transitions: [...params.transitions, newTransition],
      });
    },

    parse(input) {
      if (!(input.state in params.states)) {
        throw new Error(`Unknown state: ${input.state}`);
      }
      const state = input.state as keyof TStates;
      return this.parseState(state, input);
    },

    parseState(state, input) {
      const schema = params.states[state];
      const data = schema.parse(input);

      return createFSMState({
        states: params.states,
        transitions: params.transitions,
        state,
        data,
      });
    },
  };
}

export function initFSM<TStates extends States>(
  states: TStates,
): FSM<TStates, []> {
  return createFSMDefinition({
    states,
    transitions: [],
  });
}
