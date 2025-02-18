import {
  DisplayPropertiesSchema,
  DisplayProperty,
  DisplayPropertySchema,
  ErrorWithStack,
  ErrorWithStackSchema,
  EventSpecificationSchema,
  StyleSchema,
} from "@trigger.dev/internal";
import { z } from "zod";
import { PrismaClient, prisma } from "~/db.server";

type RunOptions = {
  id: string;
  userId: string;
};

export type Task = NonNullable<
  Awaited<ReturnType<RunPresenter["call"]>>
>["tasks"][number];
export type Event = NonNullable<
  Awaited<ReturnType<RunPresenter["call"]>>
>["event"];

type QueryTask = NonNullable<
  Awaited<ReturnType<RunPresenter["query"]>>
>["tasks"][number];

const taskSelect = {
  id: true,
  displayKey: true,
  name: true,
  icon: true,
  status: true,
  delayUntil: true,
  description: true,
  properties: true,
  error: true,
  startedAt: true,
  completedAt: true,
  style: true,
  parentId: true,
  runConnection: {
    select: {
      integration: {
        select: {
          definitionId: true,
          title: true,
          slug: true,
        },
      },
    },
  },
} as const;

export class RunPresenter {
  #prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.#prismaClient = prismaClient;
  }

  public async call({ id, userId }: RunOptions) {
    const run = await this.query({ id, userId });

    if (!run) {
      return undefined;
    }

    //merge the properties from the version and the run, with the run properties taking precedence
    const mergedProperties = new Map<string, DisplayProperty>();
    if (run.version.properties) {
      const properties = DisplayPropertiesSchema.parse(run.version.properties);
      for (const property of properties) {
        mergedProperties.set(property.label, property);
      }
    }
    if (run.properties) {
      const properties = DisplayPropertiesSchema.parse(run.properties);
      for (const property of properties) {
        mergedProperties.set(property.label, property);
      }
    }
    if (run.version.eventSpecification) {
      const eventSpecification = EventSpecificationSchema.parse(
        run.version.eventSpecification
      );
      if (eventSpecification.properties) {
        for (const properties of eventSpecification.properties) {
          mergedProperties.set(properties.label, properties);
        }
      }
    }

    const enrichTask = (task: QueryTask) => {
      const { children, ...t } = task;
      return {
        ...t,
        error: t.error ? ErrorWithStackSchema.parse(t.error) : undefined,
        connection: t.runConnection,
        properties:
          t.properties == null
            ? []
            : z.array(DisplayPropertySchema).parse(t.properties),
        style: t.style ? StyleSchema.parse(t.style) : undefined,
      };
    };

    type EnrichedTask = ReturnType<typeof enrichTask> & {
      subtasks: EnrichedTask[];
    };

    const recursivelyEnrichTasks = (task: QueryTask[]): EnrichedTask[] => {
      return task.map((t) => {
        const enrichedTask = enrichTask(t);

        return {
          ...enrichedTask,
          subtasks: recursivelyEnrichTasks(t.children),
        };
      });
    };

    let runError: ErrorWithStack | undefined = undefined;
    let runOutput: string | null | undefined = run.output
      ? JSON.stringify(run.output, null, 2)
      : null;

    if (run.status === "FAILURE") {
      const error = ErrorWithStackSchema.safeParse(run.output);

      if (error.success) {
        runError = error.data;
        runOutput = null;
      } else {
        runError = { message: "Unknown error" };
        runOutput = null;
      }
    }

    return {
      id: run.id,
      number: run.number,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      isTest: run.isTest,
      version: run.version.version,
      output: runOutput,
      properties: Array.from(mergedProperties.values()),
      environment: {
        type: run.environment.type,
        slug: run.environment.slug,
      },
      event: run.event,
      tasks: recursivelyEnrichTasks(run.tasks),
      runConnections: run.runConnections,
      missingConnections: run.missingConnections,
      error: runError,
    };
  }

  query({ id, userId }: RunOptions) {
    return this.#prismaClient.jobRun.findFirst({
      select: {
        id: true,
        number: true,
        status: true,
        startedAt: true,
        completedAt: true,
        isTest: true,
        properties: true,
        output: true,
        version: {
          select: {
            version: true,
            properties: true,
            eventSpecification: true,
          },
        },
        environment: {
          select: {
            type: true,
            slug: true,
          },
        },
        event: {
          select: {
            id: true,
            name: true,
            payload: true,
            timestamp: true,
            deliveredAt: true,
          },
        },
        tasks: {
          select: {
            ...taskSelect,
            children: {
              select: {
                ...taskSelect,
                children: {
                  select: {
                    ...taskSelect,
                    children: {
                      select: {
                        ...taskSelect,
                        children: {
                          select: {
                            ...taskSelect,
                            children: {
                              select: {
                                ...taskSelect,
                              },
                              orderBy: {
                                createdAt: "asc",
                              },
                            },
                          },
                          orderBy: {
                            createdAt: "asc",
                          },
                        },
                      },
                      orderBy: {
                        createdAt: "asc",
                      },
                    },
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          where: {
            parentId: null,
          },
        },
        runConnections: {
          select: {
            id: true,
            key: true,
            integration: {
              select: {
                title: true,
                slug: true,
                description: true,
                scopes: true,
                definition: true,
              },
            },
          },
        },
        missingConnections: true,
      },
      where: {
        id,
        organization: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
    });
  }
}
