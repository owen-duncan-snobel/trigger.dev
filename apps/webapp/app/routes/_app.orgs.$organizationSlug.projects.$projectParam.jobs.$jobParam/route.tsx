import { Outlet, useLocation } from "@remix-run/react";
import type { LoaderArgs } from "@remix-run/server-runtime";
import { typedjson } from "remix-typedjson";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { LinkButton } from "~/components/primitives/Buttons";
import { NamedIcon } from "~/components/primitives/NamedIcon";
import {
  PageButtons,
  PageHeader,
  PageInfoGroup,
  PageInfoProperty,
  PageInfoRow,
  PageTabs,
  PageTitle,
  PageTitleRow,
} from "~/components/primitives/PageHeader";
import { Paragraph } from "~/components/primitives/Paragraph";
import { useJob } from "~/hooks/useJob";
import { useOrganization } from "~/hooks/useOrganizations";
import { useProject } from "~/hooks/useProject";
import { useOptionalRun } from "~/hooks/useRun";
import { findJobByParams } from "~/models/job.server";
import { requireUserId } from "~/services/session.server";
import { Handle } from "~/utils/handle";
import {
  JobParamsSchema,
  jobPath,
  jobSettingsPath,
  jobTestPath,
  jobTriggerPath,
} from "~/utils/pathBuilder";

export const loader = async ({ request, params }: LoaderArgs) => {
  const userId = await requireUserId(request);
  const { jobParam, projectParam, organizationSlug } =
    JobParamsSchema.parse(params);

  const job = await findJobByParams({
    userId,
    slug: jobParam,
    projectSlug: projectParam,
    organizationSlug,
  });

  if (job === null) {
    throw new Response("Not Found", {
      status: 404,
      statusText: `There is no Job ${jobParam} in this Project.`,
    });
  }

  //todo identify job
  // analytics.job.identify({ job });

  return typedjson({
    job,
  });
};

export const handle: Handle = {
  breadcrumb: {
    slug: "job",
  },
};

export default function Job() {
  const organization = useOrganization();
  const project = useProject();
  const job = useJob();
  const run = useOptionalRun();
  const renderHeader = run === undefined;
  const location = useLocation();

  const isTestPage = location.pathname.endsWith("/test");

  return renderHeader ? (
    <PageContainer>
      <PageHeader hideBorder>
        <PageTitleRow>
          <PageTitle title={job.title} />
          {!isTestPage && (
            <PageButtons>
              <LinkButton
                to={jobTestPath(organization, project, job)}
                variant="primary/small"
                shortcut={{ key: "t" }}
              >
                Test
              </LinkButton>
            </PageButtons>
          )}
        </PageTitleRow>
        <PageInfoRow>
          <PageInfoGroup>
            <PageInfoProperty
              icon={job.event.icon}
              label={"Trigger"}
              value={job.event.title}
            />
            {job.dynamic && (
              <PageInfoProperty icon="dynamic" value={"Dynamic"} />
            )}
            <PageInfoProperty icon="id" label={"ID"} value={job.slug} />
            {job.properties &&
              job.properties.map((property, index) => (
                <PageInfoProperty
                  key={index}
                  icon="property"
                  label={property.label}
                  value={property.text}
                />
              ))}
            {job.integrations.length > 0 && (
              <PageInfoProperty
                label="Integrations"
                value={
                  <span className="flex gap-0.5">
                    {job.integrations.map((integration, index) => (
                      <NamedIcon
                        key={index}
                        name={integration.icon}
                        className={"h-4 w-4"}
                      />
                    ))}
                  </span>
                }
              />
            )}
          </PageInfoGroup>
          <PageInfoGroup alignment="right">
            <Paragraph variant="extra-small" className="text-slate-600">
              UID: {job.id}
            </Paragraph>
          </PageInfoGroup>
        </PageInfoRow>
        <PageTabs
          tabs={[
            { label: "Runs", to: jobPath(organization, project, job) },
            { label: "Test", to: jobTestPath(organization, project, job) },
            {
              label: "Trigger",
              to: jobTriggerPath(organization, project, job),
            },
            {
              label: "Settings",
              to: jobSettingsPath(organization, project, job),
            },
          ]}
        />
      </PageHeader>
      <PageBody>
        <Outlet />
      </PageBody>
    </PageContainer>
  ) : (
    <Outlet />
  );
}
