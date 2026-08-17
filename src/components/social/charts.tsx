import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatCurrency, formatDay, formatNumber } from "@/lib/social/format";
import type { SeriesPoint } from "@/lib/social/analytics";
import type { OrganicPaidSplit } from "@/lib/social/types";

/*
 * As cores dos gráficos vêm dos mesmos tokens do resto da interface.
 *
 * O recharts pinta com atributos SVG, e ali `var(--cor)` funciona — o que
 * significa que trocar o tema recolore os gráficos sem nenhum JavaScript
 * envolvido. Fixar hexadecimais aqui deixaria eixos cinza-claro ilegíveis sobre
 * o fundo branco do tema claro, que é exatamente o erro que se quer evitar.
 */
const ORGANIC_COLOR = "var(--color-accent)";
const PAID_COLOR = "var(--color-primary)";
const AXIS_COLOR = "var(--color-muted-foreground)";
const GRID_COLOR = "var(--color-border)";
/** Realce sob o cursor: o próprio texto com pouca opacidade serve nos dois temas. */
const CURSOR_FILL = "color-mix(in oklch, var(--color-foreground) 6%, transparent)";

/**
 * Recharts mede o container no cliente. Só montamos os gráficos depois da
 * hidratação para o HTML do servidor não divergir do primeiro render.
 */
function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="animate-pulse rounded-xl bg-secondary/50" style={{ height }} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  );
}

type TooltipEntry = { name?: string; value?: number; color?: string; dataKey?: string };

/**
 * O rótulo do tooltip, que não é necessariamente uma data.
 *
 * Antes o tooltip rodava `formatDay` em todo rótulo de texto. Isso funcionava
 * enquanto os únicos gráficos eram séries diárias — e derrubava a **tela
 * inteira** no primeiro gráfico com outro eixo: `formatDay("18h–21h")` lança
 * `RangeError: Invalid time value` dentro do render do recharts, e o painel some
 * em branco. Testar o formato antes de converter é o que impede um eixo novo de
 * quebrar uma tela que não tem nada a ver com ele.
 */
function rotuloDoTooltip(label: string | number | undefined): string {
  if (typeof label !== "string") return label === undefined ? "" : String(label);
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatDay(label) : label;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter = formatNumber,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 font-medium">{rotuloDoTooltip(label)}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{formatter(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

/** Curva de seguidores — a evolução histórica da conta (PRD 3.2). */
export function GrowthChart({ data, height = 260 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORGANIC_COLOR} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ORGANIC_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompact}
          width={52}
          domain={["dataMin - 100", "dataMax + 100"]}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="followers"
          name="Seguidores"
          stroke={ORGANIC_COLOR}
          strokeWidth={2}
          fill="url(#growthFill)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Alcance orgânico x pago no tempo (PRD 3.2, comparativo). */
/**
 * Alcance por dia, empilhando orgânico e pago.
 *
 * Com `onSelecionarDia` as barras viram porta de entrada: clicar abre o
 * detalhamento daquele dia por canal. A barra escolhida fica destacada e as
 * outras esmaecem, para não restar dúvida sobre qual dia está aberto.
 */
export function ReachChart({
  data,
  height = 260,
  onSelecionarDia,
  diaSelecionado,
}: {
  data: SeriesPoint[];
  height?: number;
  onSelecionarDia?: (ponto: SeriesPoint) => void;
  diaSelecionado?: string | null;
}) {
  const clicavel = Boolean(onSelecionarDia);
  const opacidade = (ponto: SeriesPoint) =>
    !diaSelecionado || ponto.date === diaSelecionado ? 1 : 0.35;

  return (
    <ChartFrame height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        onClick={(estado) => {
          if (!onSelecionarDia) return;
          const ponto = estado?.activePayload?.[0]?.payload as SeriesPoint | undefined;
          if (ponto) onSelecionarDia(ponto);
        }}
        style={clicavel ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompact}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: CURSOR_FILL }} />
        <Bar dataKey="organicReach" name="Orgânico" stackId="reach" radius={[0, 0, 0, 0]}>
          {data.map((ponto) => (
            <Cell key={ponto.date} fill={ORGANIC_COLOR} fillOpacity={opacidade(ponto)} />
          ))}
        </Bar>
        <Bar dataKey="paidReach" name="Pago" stackId="reach" radius={[4, 4, 0, 0]}>
          {data.map((ponto) => (
            <Cell key={ponto.date} fill={PAID_COLOR} fillOpacity={opacidade(ponto)} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function SpendChart({ data, height = 200 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PAID_COLOR} stopOpacity={0.4} />
            <stop offset="100%" stopColor={PAID_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value)}
          width={52}
        />
        <Tooltip content={<ChartTooltip formatter={formatCurrency} />} />
        <Area
          type="monotone"
          dataKey="adSpend"
          name="Investimento"
          stroke={PAID_COLOR}
          strokeWidth={2}
          fill="url(#spendFill)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/** Participação de orgânico e pago no alcance do período. */
export function SplitDonut({ split, height = 200 }: { split: OrganicPaidSplit; height?: number }) {
  const data = [
    { name: "Orgânico", value: split.organic.reach, color: ORGANIC_COLOR },
    { name: "Pago", value: split.paid.reach, color: PAID_COLOR },
  ];
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height }}>
        Sem alcance registrado no período.
      </div>
    );
  }

  return (
    <ChartFrame height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ChartFrame>
  );
}

/**
 * Desempenho de uma publicação nos primeiros dias.
 *
 * Duas escalas no mesmo gráfico não ajudariam aqui — alcance e interações têm
 * ordens de grandeza diferentes —, então mostramos o alcance em barras e as
 * interações no rótulo do tooltip.
 */
export function PostPerformanceChart({
  data,
  height = 240,
}: {
  data: { dia: number; data: string; reach: number; engagement: number }[];
  height?: number;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="dia"
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(dia: number) => (dia === 0 ? "publicou" : `+${dia}d`)}
        />
        <YAxis
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompact}
          width={52}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const ponto = payload[0].payload as {
              dia: number;
              reach: number;
              engagement: number;
            };
            return (
              <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <div className="mb-1 font-medium">
                  {ponto.dia === 0 ? "Dia da publicação" : `${ponto.dia} dia(s) depois`}
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-muted-foreground">Alcance</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {formatNumber(ponto.reach)}
                  </span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-muted-foreground">Interações</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {formatNumber(ponto.engagement)}
                  </span>
                </div>
              </div>
            );
          }}
          cursor={{ fill: CURSOR_FILL }}
        />
        <Bar dataKey="reach" name="Alcance" fill={ORGANIC_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/** Horários de maior atividade do público (PRD 3.2, análise de público). */
export function ActivityChart({
  data,
  height = 180,
}: {
  data: { hour: number; activity: number }[];
  height?: number;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="hour"
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(hour: number) => `${hour}h`}
          interval={2}
        />
        <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          content={({ active, payload, label }) => (
            <ChartTooltip active={active} payload={payload as TooltipEntry[]} label={`${label}h`} />
          )}
          cursor={{ fill: CURSOR_FILL }}
        />
        <Bar dataKey="activity" name="Interações" fill={ORGANIC_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/**
 * O gráfico do quadro: barras empilhadas por mídia ou por rede, no eixo do
 * horário ou do dia da semana.
 *
 * É o irmão do "Alcance por origem", com a mesma gramática — barra empilhada,
 * clique para abrir o detalhe — porque a pessoa já aprendeu a ler aquele. O que
 * muda é o que está sendo cortado: ali, orgânico contra pago; aqui, o formato ou
 * a rede, ao longo do dia ou da semana.
 *
 * A cor de cada fatia vem de quem é dono dela. Rede usa a cor de marca que a
 * rede tem no resto da plataforma; formato usa uma escala do mesmo tom do
 * acento, variando a opacidade — porque formato não é marca, é grandeza da mesma
 * família, e dar seis cores a ele competiria com as cores das redes.
 */
export function QuadroDeBarras({
  barras,
  categorias,
  corDaCategoria,
  rotuloDaCategoria,
  height = 280,
  onSelecionar,
  selecionada,
}: {
  barras: {
    chave: string;
    rotulo: string;
    total: number;
    pecas: number;
    fatias: { chave: string; valor: number }[];
  }[];
  categorias: string[];
  corDaCategoria: (chave: string) => string;
  rotuloDaCategoria: (chave: string) => string;
  height?: number;
  onSelecionar?: (chave: string) => void;
  selecionada?: string | null;
}) {
  const clicavel = Boolean(onSelecionar);
  const opacidade = (chave: string) => (!selecionada || chave === selecionada ? 1 : 0.3);

  /**
   * As fatias viram campos da própria linha, com prefixo.
   *
   * O recharts precisa de um `dataKey` por barra empilhada. Passar uma função
   * funciona, mas a biblioteca usa o `dataKey` como chave de reconciliação do
   * React — e duas funções viram a mesma string, o que produz chaves repetidas e
   * o aviso que vem junto. Um campo por categoria resolve na origem. O prefixo
   * evita que uma categoria chamada "total" ou "pecas" atropele um campo real.
   */
  const dados = barras.map((barra) => ({
    ...barra,
    ...Object.fromEntries(barra.fatias.map((fatia) => [`v:${fatia.chave}`, fatia.valor])),
  }));

  return (
    <ChartFrame height={height}>
      <BarChart
        data={dados}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        onClick={(estado) => {
          if (!onSelecionar) return;
          const barra = estado?.activePayload?.[0]?.payload as { chave?: string } | undefined;
          if (barra?.chave) onSelecionar(barra.chave);
        }}
        style={clicavel ? { cursor: "pointer" } : undefined}
      >
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="rotulo"
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          // Oito faixas ou sete dias cabem todos rotulados. Vinte e quatro horas
          // não cabem — os rótulos se sobrepõem e nenhum se lê. Pular um em cada
          // dois mantém a régua legível; as vinte e quatro barras continuam
          // desenhadas, que é o que a curva do dia precisa.
          interval={barras.length > 12 ? 1 : 0}
        />
        <YAxis
          stroke={AXIS_COLOR}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompact}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: CURSOR_FILL }} />
        {categorias.map((categoria, indice) => (
          <Bar
            key={categoria}
            dataKey={`v:${categoria}`}
            name={rotuloDaCategoria(categoria)}
            stackId="quadro"
            // Só a última fatia arredonda o topo; arredondar todas desenharia
            // degraus no meio da pilha.
            radius={indice === categorias.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          >
            {barras.map((barra) => (
              <Cell
                key={barra.chave}
                fill={corDaCategoria(categoria)}
                fillOpacity={opacidade(barra.chave)}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartFrame>
  );
}
