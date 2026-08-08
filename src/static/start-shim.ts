/**
 * Substituto de `@tanstack/react-start` para o build estático (`bun run build:html`).
 *
 * No build normal, `createServerFn` transforma cada função de `social.functions.ts`
 * em uma chamada HTTP para o servidor. No build estático não há servidor: este
 * shim executa o mesmo `handler` direto no navegador, mantendo a assinatura
 * `fn({ data })` e a validação de entrada. É por isso que a demonstração em HTML
 * roda exatamente o mesmo código de domínio da aplicação real — nenhuma tela
 * precisa saber onde a lógica está sendo executada.
 */

type Validator<T> = { parse: (input: unknown) => T };

type Handler<TInput, TOutput> = (ctx: { data: TInput }) => Promise<TOutput> | TOutput;

type Callable<TInput, TOutput> = TInput extends undefined
  ? (opts?: { data?: undefined }) => Promise<TOutput>
  : (opts: { data: TInput }) => Promise<TOutput>;

type Builder<TInput> = {
  inputValidator: <TNext>(validator: Validator<TNext>) => Builder<TNext>;
  handler: <TOutput>(handler: Handler<TInput, TOutput>) => Callable<TInput, TOutput>;
};

export function createServerFn(_options?: { method?: string }): Builder<undefined> {
  let validator: Validator<unknown> | null = null;

  const builder: Builder<unknown> = {
    inputValidator(next) {
      validator = next as Validator<unknown>;
      return builder as never;
    },
    handler(handler) {
      return (async (opts?: { data?: unknown }) => {
        const data = validator ? validator.parse(opts?.data) : opts?.data;
        return handler({ data } as never);
      }) as never;
    },
  };

  return builder as Builder<undefined>;
}

// Exportados apenas para satisfazer importações do módulo original; o build
// estático não usa middleware nem entrada de servidor.
export function createMiddleware() {
  return { server: () => ({}) };
}

export function createStart(factory: () => unknown) {
  return factory;
}
