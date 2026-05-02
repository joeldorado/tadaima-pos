<?php

namespace App\Storage;

use Google\Cloud\Storage\StorageObject;
use League\Flysystem\GoogleCloudStorage\PortableVisibilityHandler;
use League\Flysystem\GoogleCloudStorage\VisibilityHandler;
use League\Flysystem\Visibility;

/**
 * GCS visibility handler for buckets with Uniform Bucket-Level Access.
 * Skips per-object ACLs entirely — visibility is controlled by bucket IAM.
 */
class UniformBucketVisibilityHandler implements VisibilityHandler
{
    public function setVisibility(StorageObject $object, string $visibility): void
    {
        // No-op: bucket IAM (allUsers objectViewer) handles public access
    }

    public function determineVisibility(StorageObject $object): string
    {
        return Visibility::PUBLIC;
    }

    public function visibilityToPredefinedAcl(string $visibility): string
    {
        return PortableVisibilityHandler::NO_PREDEFINED_VISIBILITY;
    }
}
