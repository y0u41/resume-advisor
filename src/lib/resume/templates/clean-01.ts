// clean-01 · 简洁单栏（版式参考 resume-workshop，MIT License）
// 单栏纵向流，标题细线分隔，无装饰块；信息密度高、最通用，适合大多数岗位。
export const clean01 = {
  code: "clean-01",
  name: "简洁单栏",
  category: "通用",
  sortOrder: 10,
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
{{#if education}}
<section>
  <h2>教育背景</h2>
  {{#each education}}
  <div class="item">
    <div class="row"><span class="strong">{{school}}</span><span class="date">{{start}} – {{end}}</span></div>
    <div class="sub">{{major}}{{#if degree}} · {{degree}}{{/if}}</div>
    {{#if extra}}<div class="sub pre">{{extra}}</div>{{/if}}
  </div>
  {{/each}}
</section>
{{/if}}
{{#if experience}}
<section>
  <h2>工作经历</h2>
  {{#each experience}}
  <div class="item">
    <div class="row"><span class="strong">{{company}}</span><span class="date">{{start}} – {{end}}</span></div>
    {{#if role}}<div class="sub">{{role}}</div>{{/if}}
    {{#if bullets}}
    <ul>
      {{#each bullets}}<li>{{this}}</li>{{/each}}
    </ul>
    {{/if}}
  </div>
  {{/each}}
</section>
{{/if}}
{{#if projects}}
<section>
  <h2>项目经历</h2>
  {{#each projects}}
  <div class="item">
    <div class="row"><span class="strong">{{name}}</span>{{#if role}}<span class="sub">{{role}}</span>{{/if}}</div>
    {{#if desc}}<p class="desc">{{desc}}</p>{{/if}}
    {{#if bullets}}
    <ul>
      {{#each bullets}}<li>{{this}}</li>{{/each}}
    </ul>
    {{/if}}
  </div>
  {{/each}}
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
