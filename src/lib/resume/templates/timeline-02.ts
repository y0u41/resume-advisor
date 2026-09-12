// timeline-02 · 时间轴（版式参考 resume-workshop，MIT License）
// 左侧日期 + 竖线圆点的时间轴叙事，强调成长脉络；适合经历连贯、想突出时间线的求职者。
export const timeline02 = {
  code: "timeline-02",
  name: "时间轴",
  category: "通用",
  sortOrder: 20,
  html: `<div class="page">
<header class="hd">
  {{#if photo}}<img class="tpl-photo" src="{{photo}}" alt="" />{{/if}}
  <h1>{{basics.name}}</h1>
  <p class="meta">
    {{#if basics.city}}<span>{{basics.city}}</span>{{/if}}
    {{#if basics.phone}}<span>{{basics.phone}}</span>{{/if}}
    {{#if basics.email}}<span>{{basics.email}}</span>{{/if}}
    {{#each basics.links}}<span>{{this}}</span>{{/each}}
  </p>
</header>
{{#if summary}}
<section>
  <h2>自我评价</h2>
  <p class="summary">{{summary}}</p>
</section>
{{/if}}
{{#if experience}}
<section>
  <h2>工作经历</h2>
  <div class="timeline">
    {{#each experience}}
    <div class="node">
      <div class="when">{{start}}<br>{{end}}</div>
      <div class="body">
        <div class="strong">{{company}}</div>
        {{#if role}}<div class="sub">{{role}}</div>{{/if}}
        {{#if bullets}}
        <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
        {{/if}}
      </div>
    </div>
    {{/each}}
  </div>
</section>
{{/if}}
{{#if projects}}
<section>
  <h2>项目经历</h2>
  <div class="timeline">
    {{#each projects}}
    <div class="node">
      <div class="when">项目</div>
      <div class="body">
        <div class="strong">{{name}}</div>
        {{#if role}}<div class="sub">{{role}}</div>{{/if}}
        {{#if desc}}<p class="desc">{{desc}}</p>{{/if}}
        {{#if bullets}}
        <ul>{{#each bullets}}<li>{{this}}</li>{{/each}}</ul>
        {{/if}}
      </div>
    </div>
    {{/each}}
  </div>
</section>
{{/if}}
{{#if education}}
<section>
  <h2>教育背景</h2>
  <div class="timeline">
    {{#each education}}
    <div class="node">
      <div class="when">{{start}}<br>{{end}}</div>
      <div class="body">
        <div class="strong">{{school}}</div>
        <div class="sub">{{major}}{{#if degree}} · {{degree}}{{/if}}</div>
        {{#if extra}}<div class="sub pre">{{extra}}</div>{{/if}}
      </div>
    </div>
    {{/each}}
  </div>
</section>
{{/if}}
{{#if skills}}
<section>
  <h2>技能特长</h2>
  <p class="tags">{{#each skills}}<span class="tag">{{this}}</span>{{/each}}</p>
</section>
{{/if}}
</div>`,
};
